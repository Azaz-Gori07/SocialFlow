import { AppError } from '../../../shared/errors/appError';
import { EncryptionAdapter } from '../../../services/social/adapters/encryption.adapter';
import { IDeveloperConnection } from './connection.model';
import { ConnectionRepository } from './connection.repository';
import { exchangeCode, fetchGitHubUser, getAuthUrl, verifyState } from '../github/github.oauth';

export interface GitHubConnectionStatus {
  connected: boolean;
  login?: string;
  avatarUrl?: string;
  name?: string;
  providerUserId?: string;
  connectedAt?: string;
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
    return EncryptionAdapter.decrypt(connection.accessTokenEncrypted);
  }

  async disconnect(userId: string): Promise<{ disconnected: boolean }> {
    const removed = await this.connectionRepository.remove(userId);
    return { disconnected: removed };
  }

  /** Token fields never appear here — the connection model's toJSON also strips them. */
  private toStatus(connection: IDeveloperConnection): GitHubConnectionStatus {
    const meta = (connection.metadata || {}) as Record<string, any>;
    return {
      connected: true,
      login: meta.login,
      avatarUrl: meta.avatar_url,
      name: meta.name,
      providerUserId: connection.providerUserId,
      connectedAt: connection.createdAt
    };
  }
}

export default ConnectionService;
