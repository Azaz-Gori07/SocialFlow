import { ConnectionRepository } from '../connections/connection.repository';
import { ConnectionService } from '../connections/connection.service';
import mongoose from 'mongoose';
import DeveloperConnectionModel from '../connections/connection.model';

describe('GitHub token server-side refresh and long-lived storage', () => {
  const repo = new ConnectionRepository();
  const service = new ConnectionService(repo);
  const testUserId = 'test_gh_refresh_user';

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  afterAll(async () => {
    await DeveloperConnectionModel.deleteMany({ userId: testUserId });
  });

  it('stores and preserves refresh tokens and tokenExpiresAt on connection', async () => {
    const expiresAt = new Date(Date.now() + 28800 * 1000).toISOString();
    const conn = await repo.upsert(testUserId, {
      accessToken: 'ghu_test_access_token_12345',
      refreshToken: 'ghr_test_refresh_token_67890',
      tokenExpiresAt: expiresAt,
      providerUserId: '99999',
      scope: 'read:user repo',
      metadata: { login: 'test-user' }
    });

    expect(conn.accessTokenEncrypted).toBeDefined();
    expect(conn.refreshTokenEncrypted).toBeDefined();
    expect(conn.tokenExpiresAt).toBe(expiresAt);

    // Verify token can be decrypted
    const token = await service.getAccessToken(testUserId);
    expect(token).toBe('ghu_test_access_token_12345');
  });
});
