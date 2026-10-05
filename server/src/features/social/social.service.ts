import { SocialRepository } from './social.repository';
import { OAuthConnectionRepository } from './oauthConnection.repository';
import { OAuthTransactionRepository } from './oauthTransaction.repository';
import { ProviderFactory } from '../../services/social/providers/provider.factory';
import { EncryptionAdapter } from '../../services/social/adapters/encryption.adapter';
import { AppError } from '../../shared/errors/appError';
import { ISocialAccount } from './social.model';
import { IOAuthConnection } from './oauthConnection.model';
import { SocialProvider, AuthTokens, ProviderAccount } from '../../services/social/interfaces/socialProvider.interface';
import { mediaKinds } from '../../services/social/interfaces/providerCapabilities';
import { generateState, generatePkce } from '../../shared/utils/crypto';
import { toSafeAccount, toSafeAccountList, toSafeConnection } from './social.sanitizer';
import { logger } from '../../shared/utils/logger';
import { ProviderError } from '../../services/social/errors/providerError';

const OAUTH_TTL_MS = 15 * 60 * 1000; // 15 minutes

function normalizePlatform(platform: string): string {
  const p = platform.toLowerCase().trim();
  if (p === 'x') return 'twitter';
  if (p === 'google') return 'youtube';
  return p;
}

export class SocialService {
  constructor(
    private socialRepository: SocialRepository,
    private connectionRepository: OAuthConnectionRepository,
    private transactionRepository: OAuthTransactionRepository
  ) {}

  /**
   * Starts a real OAuth flow:
   * - creates a one-time server-side transaction (state + PKCE verifier)
   * - returns the provider authorization URL
   */
  async getConnectUrl(platform: string, userId: string, redirectHost: string): Promise<{ url: string; platform: string }> {
    const clean = normalizePlatform(platform);
    const provider = ProviderFactory.getConfiguredProvider(clean);
    const redirectUri = this.getRedirectUri(clean, redirectHost);

    const state = generateState();
    const pkce = generatePkce();

    await this.transactionRepository.create({
      state,
      userId,
      platform: provider.platform,
      redirectUri,
      codeVerifier: pkce.verifier,
      expiresAt: new Date(Date.now() + OAUTH_TTL_MS),
    });

    const url = provider.getAuthorizationUrl({ state, redirectUri, codeChallenge: pkce.challenge });
    return { url, platform: provider.platform };
  }

  /**
   * Completes the OAuth callback:
   * - validates + consumes the transaction (one-time use, anti-replay)
   * - exchanges the code for tokens
   * - upserts the user-level connection
   * - discovers and upserts provider accounts (each with its own token if the
   *   provider grants account-scoped tokens, e.g. Meta page tokens)
   */
  async handleCallback(
    platform: string,
    code: string,
    state: string,
    redirectHost: string
  ): Promise<{ connection: ReturnType<typeof toSafeConnection>; accounts: ReturnType<typeof toSafeAccountList> }> {
    const clean = normalizePlatform(platform);
    const provider = ProviderFactory.getConfiguredProvider(clean);
    // Must match getConnectUrl, which builds tx.redirectUri from `clean`.
    // MetaProvider serves BOTH facebook and instagram with provider.platform
    // hardcoded to 'facebook' — using it here made every Instagram callback
    // fail its own redirectUri guard with 'OAuth redirect URI mismatch'.
    const redirectUri = this.getRedirectUri(clean, redirectHost);

    await this.transactionRepository.expireOld();

    const tx = await this.transactionRepository.findByState(state);
    if (!tx) {
      throw AppError.oauthStateMismatch();
    }
    if (tx.status === 'used') {
      throw AppError.oauthStateMismatch();
    }
    if (tx.expiresAt.getTime() < Date.now()) {
      throw AppError.oauthTransactionExpired();
    }
    if (tx.platform !== provider.platform) {
      throw AppError.oauthFailed('OAuth provider mismatch');
    }
    if (tx.redirectUri !== redirectUri) {
      throw AppError.oauthFailed('OAuth redirect URI mismatch');
    }

    // One-time use: only one callback may consume this transaction.
    const consumed = await this.transactionRepository.consume(state);
    if (!consumed) {
      throw AppError.oauthTransactionExpired();
    }

    const tokens = await provider.exchangeCode({ code, redirectUri, codeVerifier: tx.codeVerifier });
    const identity = await provider.getAuthenticatedIdentity(tokens);

    const connection = await this.connectionRepository.upsert(
      { userId: tx.userId, platform: provider.platform, externalAccountId: identity.externalAccountId },
      {
        provider: provider.provider,
        status: 'connected',
        encryptedAccessToken: EncryptionAdapter.encrypt(tokens.accessToken),
        encryptedRefreshToken: tokens.refreshToken ? EncryptionAdapter.encrypt(tokens.refreshToken) : undefined,
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: identity.scopes,
        lastValidatedAt: new Date().toISOString(),
        lastError: undefined,
      }
    );

    const discovered = await provider.discoverAccounts(tokens);
    const accounts: ISocialAccount[] = [];

    for (const discoveredAccount of discovered) {
      const account = await this.upsertDiscoveredAccount(
        tx.userId,
        provider,
        tokens,
        connection,
        discoveredAccount
      );
      accounts.push(account);
    }

    await this.connectionRepository.setLastValidated(connection._id.toString());
    logger.info(`[social] ${provider.platform} connected for user ${tx.userId}`, {
      accounts: accounts.length,
      connection: connection._id.toString(),
    });

    return { connection: toSafeConnection(connection), accounts: toSafeAccountList(accounts) };
  }

  private async upsertDiscoveredAccount(
    userId: string,
    provider: SocialProvider,
    userTokens: AuthTokens,
    connection: IOAuthConnection,
    discovered: ProviderAccount
  ): Promise<ISocialAccount> {
    const caps = provider.getCapabilities(discovered);

    const data: Partial<ISocialAccount> = {
      workspaceId: undefined,
      accountType: discovered.accountType,
      providerParentAccountId: discovered.providerParentAccountId,
      username: discovered.username,
      displayName: discovered.displayName,
      avatarUrl: discovered.avatarUrl,
      capabilities: {
        createPost: caps.createPost,
        uploadMedia: caps.uploadImage || caps.uploadVideo,
        getInsights: caps.insights,
        listComments: caps.commentsRead,
        replyToComment: caps.commentsWrite,
        mediaTypes: mediaKinds(caps),
      },
      providerCapabilities: caps,
      status: 'active',
      connectionStatus: 'connected',
      connectionId: connection._id.toString(),
      // Account-scoped token (Meta page tokens). The connection token stays the fallback.
      encryptedAccessToken: discovered.accountToken
        ? EncryptionAdapter.encrypt(discovered.accountToken)
        : undefined,
      encryptedRefreshToken: undefined,
      accessTokenExpiresAt: discovered.accountToken ? userTokens.expiresAt : undefined,
      lastValidatedAt: new Date().toISOString(),
      lastError: undefined,
    };

    return this.socialRepository.upsertAccount(
      { userId, platform: provider.platform, providerAccountId: discovered.providerAccountId },
      data
    );
  }

  /** All connected accounts for the user (optionally workspace-scoped). */
  async listAccounts(userId: string, workspaceId?: string): Promise<ReturnType<typeof toSafeAccountList>> {
    const accounts = await this.socialRepository.findAccountsForWorkspaceMember(userId, workspaceId);
    return toSafeAccountList(accounts);
  }

  /** Accounts the provider exposes for the user's connection, with connection state. */
  async listDiscoverableAccounts(
    userId: string,
    platform: string
  ): Promise<
    Array<{
      providerAccountId: string;
      accountType: string;
      username: string;
      displayName: string;
      avatarUrl?: string;
      capabilities: ProviderAccount['capabilities'];
      connected: boolean;
      socialAccountId?: string;
    }>
  > {
    const clean = normalizePlatform(platform);
    const provider = ProviderFactory.getConfiguredProvider(clean);
    const connection = await this.requireConnection(userId, provider.platform);

    const tokens = this.decryptConnectionTokens(connection);
    const discovered = await provider.discoverAccounts(tokens);
    const existing = await this.socialRepository.findAccountsByUserId(userId);
    const connectedIds = new Set(existing.filter((a) => a.platform === provider.platform).map((a) => a.providerAccountId));

    return discovered.map((d) => {
      const existingAccount = existing.find(
        (a) => a.platform === provider.platform && a.providerAccountId === d.providerAccountId
      );
      return {
        providerAccountId: d.providerAccountId,
        accountType: d.accountType,
        username: d.username,
        displayName: d.displayName,
        avatarUrl: d.avatarUrl,
        capabilities: provider.getCapabilities(d),
        connected: connectedIds.has(d.providerAccountId),
        socialAccountId: existingAccount?._id.toString(),
      };
    });
  }

  /** Connects (or re-syncs) one specific provider account into SocialFlow. */
  async selectAccount(userId: string, platform: string, providerAccountId: string): Promise<ReturnType<typeof toSafeAccount>> {
    const clean = normalizePlatform(platform);
    const provider = ProviderFactory.getConfiguredProvider(clean);
    const connection = await this.requireConnection(userId, provider.platform);

    const tokens = this.decryptConnectionTokens(connection);
    const discovered = await provider.discoverAccounts(tokens);
    const target = discovered.find((d) => d.providerAccountId === providerAccountId);
    if (!target) {
      throw AppError.notFound('Provider account not found in this connection');
    }

    const account = await this.upsertDiscoveredAccount(userId, provider, tokens, connection, target);
    return toSafeAccount(account);
  }

  /** Disconnects a social account (ownership checked) and cascades its data. */
  /**
   * Sets the default-publishing preference for one account. Convenience for
   * NEW content only — never affects already scheduled posts (their target
   * snapshot is immutable).
   */
  async setPublishDefault(
    id: string,
    userId: string,
    publishDefault: boolean
  ): Promise<ReturnType<typeof toSafeAccount>> {
    const account = await this.socialRepository.findAccountById(id);
    if (!account) throw AppError.notFound('Social account not found');
    if (account.userId !== userId) throw AppError.forbidden('Unauthorized access to this social account');

    const updated = await this.socialRepository.updateAccount(id, { publishDefault });
    if (!updated) throw AppError.internal('Failed to update social account');
    return toSafeAccount(updated);
  }

  async disconnectAccount(id: string, userId: string): Promise<void> {
    const account = await this.socialRepository.findAccountById(id);
    if (!account) throw AppError.notFound('Social account not found');
    if (account.userId !== userId) throw AppError.forbidden('Unauthorized access to this social account');

    await this.socialRepository.deleteAccount(id);
    await this.socialRepository.deleteCascadeData(id);
    logger.info(`[social] account disconnected ${id}`);
  }

  /** Refreshes a connection's tokens; marks the connection unhealthy when refresh fails. */
  async refreshConnection(connectionId: string, userId: string): Promise<ReturnType<typeof toSafeConnection>> {
    const connection = await this.connectionRepository.findByIdAndUser(connectionId, userId);
    if (!connection) throw AppError.notFound('OAuth connection not found');

    const provider = ProviderFactory.getConfiguredProvider(connection.platform);

    try {
      let tokens: AuthTokens;
      if (connection.encryptedRefreshToken) {
        const refresh = EncryptionAdapter.decrypt(connection.encryptedRefreshToken);
        tokens = await provider.refreshAccessToken(refresh);
      } else {
        // No refresh token (e.g. Meta long-lived tokens): try re-validating; if the
        // token is still valid we can keep it, otherwise the user must reconnect.
        tokens = this.decryptConnectionTokens(connection);
        const validation = await provider.validateConnection(tokens, { providerAccountId: connection.externalAccountId } as any);
        if (!validation.healthy) {
          await this.connectionRepository.setStatus(connection._id.toString(), 'expired', validation.errorMessage);
          throw AppError.providerAuthExpired(validation.errorMessage);
        }
      }

      await this.connectionRepository.setTokens(connection._id.toString(), {
        encryptedAccessToken: EncryptionAdapter.encrypt(tokens.accessToken),
        encryptedRefreshToken: tokens.refreshToken ? EncryptionAdapter.encrypt(tokens.refreshToken) : undefined,
        accessTokenExpiresAt: tokens.expiresAt,
      });
      await this.connectionRepository.setStatus(connection._id.toString(), 'connected');
      await this.connectionRepository.setLastValidated(connection._id.toString());
      return toSafeConnection(await this.connectionRepository.findById(connection._id.toString()));
    } catch (err) {
      if (err instanceof ProviderError && (err.status === 401 || err.status === 400)) {
        await this.connectionRepository.setStatus(connection._id.toString(), 'expired', err.message);
        throw AppError.providerAuthExpired('Connected account needs re-authentication');
      }
      throw err;
    }
  }

  /** Resolves the token bundle for a social account (account token > connection token). */
  async resolveAccountTokenBundle(
    accountId: string
  ): Promise<{ account: ISocialAccount; accessToken: string; refreshToken?: string; expiresAt?: string }> {
    const account = await this.socialRepository.findAccountById(accountId);
    if (!account) throw AppError.notFound('Social account not found');

    let accessToken: string | undefined;
    let refreshToken: string | undefined;
    let expiresAt = account.accessTokenExpiresAt;

    if (account.encryptedAccessToken) {
      accessToken = EncryptionAdapter.decrypt(account.encryptedAccessToken);
      if (account.encryptedRefreshToken) refreshToken = EncryptionAdapter.decrypt(account.encryptedRefreshToken);
    } else if (account.connectionId) {
      const connection = await this.connectionRepository.findById(account.connectionId);
      if (!connection || connection.status !== 'connected') {
        throw AppError.providerAuthExpired();
      }
      accessToken = EncryptionAdapter.decrypt(connection.encryptedAccessToken);
      if (connection.encryptedRefreshToken) refreshToken = EncryptionAdapter.decrypt(connection.encryptedRefreshToken);
      expiresAt = connection.accessTokenExpiresAt;
    }

    if (!accessToken) {
      throw AppError.providerAuthExpired();
    }

    return { account, accessToken, refreshToken, expiresAt };
  }

  /**
   * Refreshes an account's provider token after the provider rejected the current
   * one, and stores the new encrypted token. Used by the delivery engine so an
   * expired access token costs one extra provider call instead of killing the
   * delivery and forcing a manual reconnect.
   *
   * Returns the new access token, or null when the account has no refresh
   * capability — in which case it genuinely requires reconnecting.
   */
  async refreshAccountTokenForDelivery(accountId: string, userId: string): Promise<string | null> {
    const account = await this.socialRepository.findAccountById(accountId);
    if (!account) throw AppError.notFound('Social account not found');
    if (account.userId !== userId) {
      throw AppError.forbidden('Social account does not belong to this user');
    }

    const provider = ProviderFactory.getConfiguredProvider(account.platform);

    // The OAuth connection owns the refresh token; accounts inherit from it.
    let refreshToken: string | undefined;
    if (account.encryptedRefreshToken) {
      refreshToken = EncryptionAdapter.decrypt(account.encryptedRefreshToken);
    } else if (account.connectionId) {
      const connection = await this.connectionRepository.findById(account.connectionId);
      if (connection?.encryptedRefreshToken) {
        refreshToken = EncryptionAdapter.decrypt(connection.encryptedRefreshToken);
      }
    }

    if (!refreshToken) return null;

    const tokens = await provider.refreshAccessToken(refreshToken);
    if (!tokens.accessToken) return null;

    const encryptedAccessToken = EncryptionAdapter.encrypt(tokens.accessToken);
    const encryptedRefreshToken = tokens.refreshToken
      ? EncryptionAdapter.encrypt(tokens.refreshToken)
      : undefined;
    const expiresAt = tokens.expiresAt;

    const accountUpdate: Record<string, unknown> = {
      encryptedAccessToken,
      status: 'active'
    };
    if (encryptedRefreshToken) accountUpdate.encryptedRefreshToken = encryptedRefreshToken;
    if (expiresAt) accountUpdate.accessTokenExpiresAt = expiresAt;
    await this.socialRepository.updateAccount(accountId, accountUpdate as any);

    if (account.connectionId) {
      const connectionUpdate: Record<string, unknown> = { encryptedAccessToken };
      if (encryptedRefreshToken) connectionUpdate.encryptedRefreshToken = encryptedRefreshToken;
      if (expiresAt) connectionUpdate.accessTokenExpiresAt = expiresAt;
      await this.connectionRepository.setTokens(account.connectionId, connectionUpdate as any);
    }

    return tokens.accessToken;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async requireConnection(userId: string, platform: string): Promise<IOAuthConnection> {
    const connections = await this.connectionRepository.findByUserIdPlatform(userId, platform);
    const connected = connections.find((c) => c.status === 'connected') || connections[0];
    if (!connected) {
      throw AppError.badRequest(`No connected ${platform} account found. Connect it first.`);
    }
    if (connected.status !== 'connected') {
      throw AppError.providerAuthExpired();
    }
    return connected;
  }

  private decryptConnectionTokens(connection: IOAuthConnection): AuthTokens {
    if (!connection.encryptedAccessToken) {
      throw AppError.providerAuthExpired();
    }
    return {
      accessToken: EncryptionAdapter.decrypt(connection.encryptedAccessToken),
      refreshToken: connection.encryptedRefreshToken
        ? EncryptionAdapter.decrypt(connection.encryptedRefreshToken)
        : undefined,
      expiresAt: connection.accessTokenExpiresAt,
    };
  }

  private getRedirectUri(platform: string, redirectHost: string): string {
    return `${redirectHost}/api/social/callback/${platform}`;
  }
}
export default SocialService;
