import crypto from 'crypto';
import { env } from '../../shared/config/env.config';
import { EncryptionAdapter } from '../../services/social/adapters/encryption.adapter';
import { ProviderError } from '../../services/social/errors/providerError';
import { SocialRepository } from './social.repository';
import { ISocialAccount } from './social.model';
import { AppError } from '../../shared/errors/appError';
import { logger } from '../../shared/utils/logger';

/**
 * Unofficial X publishing session ("bridge").
 *
 * Transport: a single stateless Python serverless function (`/x-compat`) that
 * runs twikit. The official OAuth path stays primary; this session is only used
 * when X rejects an official post with 402 credits-depleted.
 *
 * Secrets (auth_token / ct0) are encrypted with the same adapter as OAuth
 * tokens, never returned by any API, and never logged. Passwords are forwarded
 * once to the bridge for login and are not persisted anywhere.
 */

export interface XSessionStatus {
  connected: boolean;
  method: 'cookies' | 'password' | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
}

interface BridgeVerifyResult {
  ok: true;
  user_id: string;
  username: string;
}

interface BridgeLoginResult extends BridgeVerifyResult {
  auth_token: string;
  ct0: string;
}

interface BridgePostResult {
  ok: true;
  tweet_id: string;
  url: string;
}

const BRIDGE_TIMEOUT_MS = 55_000;

export class XSessionService {
  constructor(private socialRepository: SocialRepository = new SocialRepository()) {}

  /** Shared secret between the Node API and the Python function. */
  private bridgeSecret(): string {
    if (env.X_BRIDGE_SECRET) return env.X_BRIDGE_SECRET;
    // Zero-config default: both runtimes already share JWT_SECRET, so derive a
    // separate key from it instead of requiring another env var in production.
    return crypto
      .createHash('sha256')
      .update(`socialflow-x-bridge:${env.JWT_SECRET}`)
      .digest('hex');
  }

  private bridgeUrl(): string {
    if (env.X_BRIDGE_URL) return env.X_BRIDGE_URL;
    return `${env.BACKEND_URL.replace(/\/$/, '')}/x-compat`;
  }

  private async call<T extends { ok: boolean; error?: string }>(
    action: 'verify' | 'login' | 'post',
    payload: Record<string, unknown>
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
    try {
      const response = await fetch(this.bridgeUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-bridge-secret': this.bridgeSecret(),
        },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => ({}))) as T;
      if (!response.ok || !data?.ok) {
        // X-side rejections (bad cookies, challenge) are permanent; only a
        // transient bridge/network problem is worth a scheduler retry.
        const retryable = response.status >= 500 && !/did not accept|could not|challenge/i.test(data?.error || '');
        throw new ProviderError(
          `X session bridge: ${data?.error || `HTTP ${response.status}`}`,
          'twitter',
          response.status,
          'X_BRIDGE_FAILED',
          retryable
        );
      }
      return data;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError(
        `X session bridge unreachable: ${message}`,
        'twitter',
        0,
        'X_BRIDGE_UNREACHABLE',
        true
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async requireAccount(userId: string, accountId: string): Promise<ISocialAccount> {
    const account = await this.socialRepository.findAccountById(accountId);
    if (!account || String(account.userId) !== String(userId)) {
      throw AppError.notFound('Social account not found');
    }
    if (account.platform !== 'twitter') {
      throw AppError.badRequest('Session login is only available for X (Twitter) accounts');
    }
    return account;
  }

  private assertSameIdentity(
    account: ISocialAccount,
    identity: { user_id?: string; username?: string }
  ): void {
    if (identity.user_id && account.providerAccountId && identity.user_id !== account.providerAccountId) {
      throw AppError.badRequest(
        `This X session belongs to @${identity.username || identity.user_id}, but the connected account is @${account.username}. ` +
          `Open @${identity.username || identity.user_id} in SocialFlow or paste that account's session instead.`
      );
    }
  }

  private async storeSession(
    account: ISocialAccount,
    method: 'cookies' | 'password',
    authToken: string,
    ct0: string
  ): Promise<void> {
    await this.socialRepository.updateAccount(account._id.toString(), {
      xSessionAuthTokenEncrypted: EncryptionAdapter.encrypt(authToken),
      xSessionCt0Encrypted: EncryptionAdapter.encrypt(ct0),
      xSessionMethod: method,
      xSessionConnectedAt: new Date().toISOString(),
      xSessionLastError: '',
    });
  }

  /** Connect by pasting the two cookies from an already signed-in x.com tab. */
  async connectWithCookies(
    userId: string,
    accountId: string,
    input: { authToken: string; ct0: string }
  ): Promise<{ connected: true; username: string; method: 'cookies' }> {
    const account = await this.requireAccount(userId, accountId);
    const identity = await this.call<BridgeVerifyResult>('verify', {
      auth_token: input.authToken.trim(),
      ct0: input.ct0.trim(),
    });
    this.assertSameIdentity(account, identity);
    await this.storeSession(account, 'cookies', input.authToken.trim(), input.ct0.trim());
    logger.info(`[x-session] cookies connected for ${account.username} (${account._id})`);
    return { connected: true, username: identity.username || account.username, method: 'cookies' };
  }

  /** Connect by signing in with X credentials through twikit (never stored). */
  async connectWithPassword(
    userId: string,
    accountId: string,
    input: { username: string; password: string; email?: string; totpSecret?: string }
  ): Promise<{ connected: true; username: string; method: 'password' }> {
    const account = await this.requireAccount(userId, accountId);
    const identity = await this.call<BridgeLoginResult>('login', {
      username: input.username.trim(),
      email: input.email?.trim() || undefined,
      password: input.password,
      totp_secret: input.totpSecret?.trim() || undefined,
    });
    this.assertSameIdentity(account, identity);
    await this.storeSession(account, 'password', identity.auth_token, identity.ct0);
    logger.info(`[x-session] password login connected for ${account.username} (${account._id})`);
    return { connected: true, username: identity.username || account.username, method: 'password' };
  }

  async disconnect(userId: string, accountId: string): Promise<void> {
    const account = await this.requireAccount(userId, accountId);
    await this.socialRepository.clearXSession(account._id.toString());
    logger.info(`[x-session] disconnected for ${account.username} (${account._id})`);
  }

  status(account: ISocialAccount): XSessionStatus {
    const connected = Boolean(account.xSessionAuthTokenEncrypted && account.xSessionCt0Encrypted);
    return {
      connected,
      method: connected ? account.xSessionMethod || 'cookies' : null,
      connectedAt: account.xSessionConnectedAt || null,
      lastUsedAt: account.xSessionLastUsedAt || null,
      lastError: account.xSessionLastError || null,
    };
  }

  async statusForAccount(userId: string, accountId: string): Promise<XSessionStatus> {
    const account = await this.requireAccount(userId, accountId);
    return this.status(account);
  }

  hasSession(account: ISocialAccount): boolean {
    return Boolean(account.xSessionAuthTokenEncrypted && account.xSessionCt0Encrypted);
  }

  /**
   * Publishes text through the internal X web API. Returns the real tweet URL.
   * Used only as the delivery-engine fallback; official posting remains primary.
   */
  async post(
    account: ISocialAccount,
    text: string
  ): Promise<{ externalPostId: string; externalPostUrl: string }> {
    if (!this.hasSession(account)) {
      throw new ProviderError(
        'No X session is connected for this account',
        'twitter',
        401,
        'X_SESSION_MISSING',
        false
      );
    }

    const authToken = EncryptionAdapter.decrypt(account.xSessionAuthTokenEncrypted!);
    const ct0 = EncryptionAdapter.decrypt(account.xSessionCt0Encrypted!);
    const accountId = account._id.toString();

    try {
      const result = await this.call<BridgePostResult>('post', {
        auth_token: authToken,
        ct0,
        text,
      });
      await this.socialRepository
        .updateAccount(accountId, {
          xSessionLastUsedAt: new Date().toISOString(),
          xSessionLastError: '',
        })
        .catch((err) => logger.warn('[x-session] could not record last use', { error: String(err) }));
      logger.info(`[x-session] posted via internal X session (${account.username})`);
      return {
        externalPostId: result.tweet_id,
        externalPostUrl: result.url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.socialRepository
        .updateAccount(accountId, { xSessionLastError: message.slice(0, 300) })
        .catch(() => undefined);
      throw error;
    }
  }
}
