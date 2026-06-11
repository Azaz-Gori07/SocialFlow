import { SocialService } from '../social.service';
import { SocialRepository } from '../social.repository';
import { EncryptionAdapter } from '../../../services/social/adapters/encryption.adapter';
import { AppError } from '../../../shared/errors/appError';
import { TwitterProvider } from '../../../services/social/providers/twitter.provider';
import mongoose, { Schema } from 'mongoose';

// Mock schema registration for unit testing simulation data
if (!mongoose.models.AnalyticsMetric) {
  mongoose.model('AnalyticsMetric', new Schema({}));
}
if (!mongoose.models.Comment) {
  mongoose.model('Comment', new Schema({}));
}

jest.mock('../social.repository');

describe('SocialService Unit Tests', () => {
  let socialService: SocialService;
  let mockSocialRepository: jest.Mocked<SocialRepository>;

  const mockUserId = 'user_alex_123';
  const mockAccountId = 'act_mock_twitter_1234';
  
  const mockSocialAccount: any = {
    _id: 'sa_999',
    userId: mockUserId,
    platform: 'twitter',
    accountId: mockAccountId,
    username: 'alex_creator',
    displayName: 'Alex Creator',
    avatarUrl: 'http://avatar.com',
    accessToken: EncryptionAdapter.encrypt('mock_access_token'),
    refreshToken: EncryptionAdapter.encrypt('mock_refresh_token'),
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    metadata: { followerCount: 1500 }
  };

  beforeEach(() => {
    mockSocialRepository = new SocialRepository() as jest.Mocked<SocialRepository>;
    socialService = new SocialService(mockSocialRepository);
    jest.spyOn(mongoose.Model.prototype, 'save').mockResolvedValue(undefined as any);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clear PKCE verifier store timers to prevent test handle leaks
    for (const [, entry] of (TwitterProvider as any).verifierStore) {
      clearTimeout(entry.timer);
    }
    (TwitterProvider as any).verifierStore.clear();
  });

  describe('getConnectUrl', () => {
    it('should generate a valid authorization URL for twitter containing encrypted state', async () => {
      const url = await socialService.getConnectUrl('twitter', mockUserId, 'http://localhost:5000');
      expect(url).toBeDefined();
      expect(url.includes('https://twitter.com/i/oauth2/authorize') || url.includes('/callback/twitter')).toBe(true);
      
      const parsedUrl = new URL(url);
      const state = parsedUrl.searchParams.get('state');
      expect(state).toBeTruthy();

      // Decrypt state to verify contents
      const decrypted = EncryptionAdapter.decrypt(state!);
      const payload = JSON.parse(decrypted);
      expect(payload.userId).toBe(mockUserId);
      expect(payload.nonce).toBeDefined();
    });
  });

  describe('handleCallback', () => {
    it('should exchange code and create a new social account if it does not exist', async () => {
      // Use the real getConnectUrl flow to populate PKCE verifier store
      const authUrl = await socialService.getConnectUrl('twitter', mockUserId, 'http://localhost:5000');
      const parsedUrl = new URL(authUrl);
      const state = parsedUrl.searchParams.get('state')!;
      expect(state).toBeTruthy();

      mockSocialRepository.findAccountByPlatformAndAccountId.mockResolvedValue(null);
      mockSocialRepository.createAccount.mockResolvedValue(mockSocialAccount);

      const result = await socialService.handleCallback(
        'twitter',
        'mock_auth_code_123',
        state,
        'http://localhost:5000'
      );

      expect(mockSocialRepository.findAccountByPlatformAndAccountId).toHaveBeenCalledWith(
        mockUserId,
        'twitter',
        expect.stringContaining('act_mock_twitter_')
      );
      expect(mockSocialRepository.createAccount).toHaveBeenCalled();
      expect(result).toBe(mockSocialAccount);
    });

    it('should throw AppError badRequest if state has expired', async () => {
      const statePayload = {
        userId: mockUserId,
        nonce: 'randomnonce123',
        timestamp: Date.now() - 20 * 60 * 1000 // 20 minutes ago (expired)
      };
      const state = EncryptionAdapter.encrypt(JSON.stringify(statePayload));

      await expect(
        socialService.handleCallback('twitter', 'code123', state, 'http://localhost:5000')
      ).rejects.toThrow(AppError);
    });
  });

  describe('getAccounts', () => {
    it('should retrieve connected accounts list for user', async () => {
      mockSocialRepository.findAccountsByUserId.mockResolvedValue([mockSocialAccount]);

      const result = await socialService.getAccounts(mockUserId);
      expect(mockSocialRepository.findAccountsByUserId).toHaveBeenCalledWith(mockUserId);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(mockSocialAccount);
    });
  });

  describe('disconnectAccount', () => {
    it('should disconnect account and trigger cascade cleanup if owner matches', async () => {
      mockSocialRepository.findAccountById.mockResolvedValue(mockSocialAccount);
      mockSocialRepository.deleteAccount.mockResolvedValue(true);
      mockSocialRepository.deleteCascadeData.mockResolvedValue(undefined);

      await socialService.disconnectAccount('sa_999', mockUserId);

      expect(mockSocialRepository.findAccountById).toHaveBeenCalledWith('sa_999');
      expect(mockSocialRepository.deleteAccount).toHaveBeenCalledWith('sa_999');
      expect(mockSocialRepository.deleteCascadeData).toHaveBeenCalledWith('sa_999');
    });

    it('should throw forbidden AppError if user does not own the connection', async () => {
      mockSocialRepository.findAccountById.mockResolvedValue(mockSocialAccount);

      await expect(
        socialService.disconnectAccount('sa_999', 'wrong_user_id')
      ).rejects.toThrow(new AppError('Unauthorized access to this social account connection', 403));
    });
  });
});
