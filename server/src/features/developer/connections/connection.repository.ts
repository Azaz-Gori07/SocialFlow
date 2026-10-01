import DeveloperConnectionModel, { IDeveloperConnection } from './connection.model';
import { EncryptionAdapter } from '../../../services/social/adapters/encryption.adapter';

export interface UpsertConnectionInput {
  accessToken: string;
  scope?: string;
  providerUserId?: string;
  metadata: Record<string, any>;
}

type Query = Record<string, unknown>;

export class ConnectionRepository {
  async findByUser(userId: string): Promise<IDeveloperConnection | null> {
    return DeveloperConnectionModel.findOne({ userId, provider: 'github' } as Query).exec();
  }

  /**
   * Insert or replace the user's GitHub connection. The token is encrypted
   * before it reaches the model layer so no caller can accidentally persist a
   * plaintext one.
   */
  async upsert(userId: string, input: UpsertConnectionInput): Promise<IDeveloperConnection> {
    const accessTokenEncrypted = EncryptionAdapter.encrypt(input.accessToken);
    const existing = await this.findByUser(userId);
    if (existing) {
      existing.set({
        accessTokenEncrypted,
        scope: input.scope,
        providerUserId: input.providerUserId,
        metadata: input.metadata
      });
      return existing.save();
    }
    return DeveloperConnectionModel.create({
      userId,
      provider: 'github',
      accessTokenEncrypted,
      scope: input.scope,
      providerUserId: input.providerUserId,
      metadata: input.metadata
    });
  }

  async remove(userId: string): Promise<boolean> {
    const result = await DeveloperConnectionModel.deleteOne({ userId, provider: 'github' } as Query).exec();
    return result.deletedCount > 0;
  }
}

export default ConnectionRepository;
