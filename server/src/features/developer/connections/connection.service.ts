import { AppError } from '../../../shared/errors/appError';
import { EncryptionAdapter } from '../../../services/social/adapters/encryption.adapter';
import { IDeveloperConnection } from './connection.model';
import { DeveloperConnectionModel } from './connection.model';
import { ConnectionRepository } from './connection.repository';
import { exchangeCode, fetchGitHubUser, getAuthUrl, verifyState } from '../github/github.oauth';

export interface GitHubConnectionStatus {
  connected: boolean;
  login?: string;
  avatarUrl?: string;
  name?: string;
  providerUserId?: string;
  connectedAt?: string;
  /** Token present but provider rejected it (401) — user must reconnect. */
  invalid?: boolean;
  invalidReason?: string;
}

export class ConnectionService {
  constructor(private connectionRepository: ConnectionRepository) {}

  getAuthUrl(userId: string): string {
    return getAuthUrl(userId);
  }

  /**
   * Complete the OAuth handshake: verify the state belongs to this user,
   * exchange the code, then persist the token encrypted.
   */
  async connect(userId: string, code: string, state: string): Promise<GitHubConnectionStatus> {
    const stateUserId = verifyState(state);
    if (stateUserId !== userId) throw AppError.oauthStateMismatch();

    const accessToken = await exchangeCode(code);
    const profile = await fetchGitHubUser(accessToken);
    const connection = await this.connectionRepository.upsert(userId, {
      accessToken,
      providerUserId: String(profile.id),
      scope: 'read:user repo',
      metadata: { login: profile.login, avatar_url: profile.avatar_url, name: profile.name }
    });
    return this.toStatus(connection);
  }

  async getConnectedStatus(userId: string): Promise<GitHubConnectionStatus> {
    const connection = await this.connectionRepository.findByUser(userId);
    return connection ? this.toStatus(connection) : { connected: false };
  }

  /**
   * Decrypted access token for API calls. Throws rather than returning null so
   * no caller can accidentally issue an unauthenticated request.
   */
  async getAccessToken(userId: string): Promise<string> {
    const connection = await this.connectionRepository.findByUser(userId);
    if (!connection?.accessTokenEncrypted) throw AppError.notFound('GitHub not connected');
    const meta = (connection.metadata || {}) as Record<string, any>;
    if (meta.tokenInvalid) {
      throw AppError.unauthorized('GitHub access token is no longer valid. Reconnect GitHub from Developer settings.');
    }
    return EncryptionAdapter.decrypt(connection.accessTokenEncrypted);
  }

  /**
   * Flags the stored GitHub token as invalid after a provider-side 401, so the
   * UI shows "Connect GitHub" again instead of silently failing every call.
   * The next reconnect upsert replaces both the token and the metadata.
   */
  async markTokenInvalid(userId: string, reason: string): Promise<void> {
    const connection = await this.connectionRepository.findByUser(userId);
    if (!connection) return;
    await DeveloperConnectionModel.updateOne(
      { _id: connection._id },
      {
        $set: {
          'metadata.tokenInvalid': true,
          'metadata.tokenInvalidReason': reason,
          'metadata.tokenInvalidAt': new Date().toISOString()
        }
      }
    );
  }

  async disconnect(userId: string): Promise<{ disconnected: boolean }> {
    const removed = await this.connectionRepository.remove(userId);
    return { disconnected: removed };
  }

  /** Token fields never appear here — the connection model's toJSON also strips them. */
  private toStatus(connection: IDeveloperConnection): GitHubConnectionStatus {
    const meta = (connection.metadata || {}) as Record<string, any>;
    const invalid = Boolean(meta.tokenInvalid);
    return {
      connected: !invalid,
      invalid,
      invalidReason: invalid ? (meta.tokenInvalidReason || 'GitHub token is no longer valid') : undefined,
      login: invalid ? undefined : meta.login,
      avatarUrl: invalid ? undefined : meta.avatar_url,
      name: invalid ? undefined : meta.name,
      providerUserId: connection.providerUserId,
      connectedAt: connection.createdAt
    };
  }
}

export default ConnectionService;
