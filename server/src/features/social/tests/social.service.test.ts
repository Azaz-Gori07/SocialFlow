import { SocialService } from '../social.service';
import { SocialRepository } from '../social.repository';
import { OAuthConnectionRepository } from '../oauthConnection.repository';
import { OAuthTransactionRepository } from '../oauthTransaction.repository';
import { EncryptionAdapter } from '../../../services/social/adapters/encryption.adapter';
import { AppError } from '../../../shared/errors/appError';

jest.mock('../social.repository');
jest.mock('../oauthConnection.repository');
jest.mock('../oauthTransaction.repository');

describe('SocialService Unit Tests', () => {
  let socialService: SocialService;
  let mockSocialRepository: jest.Mocked<SocialRepository>;
  let mockConnectionRepository: jest.Mocked<OAuthConnectionRepository>;
  let mockTransactionRepository: jest.Mocked<OAuthTransactionRepository>;

  const mockUserId = 'user_alex_123';

  const mockSocialAccount: any = {
    _id: 'sa_999',
    userId: mockUserId,
    platform: 'twitter',
    accountType: 'profile',
    providerAccountId: 'act_mock_twitter_1234',
    username: 'alex_creator',
    displayName: 'Alex Creator',
    avatarUrl: 'http://avatar.com',
    encryptedAccessToken: EncryptionAdapter.encrypt('mock_access_token'),
    encryptedRefreshToken: EncryptionAdapter.encrypt('mock_refresh_token'),
    status: 'active',
    connectionStatus: 'connected',
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    metadata: { followerCount: 1500 }
  };

  beforeEach(() => {
    mockSocialRepository = new SocialRepository() as jest.Mocked<SocialRepository>;
    mockConnectionRepository = new OAuthConnectionRepository() as jest.Mocked<OAuthConnectionRepository>;
    mockTransactionRepository = new OAuthTransactionRepository() as jest.Mocked<OAuthTransactionRepository>;
    socialService = new SocialService(
      mockSocialRepository,
      mockConnectionRepository,
      mockTransactionRepository
    );
    jest.clearAllMocks();
  });

  describe('getConnectUrl', () => {
    it('should throw 503 when the platform provider is not configured (no mock flows)', async () => {
      await expect(
        socialService.getConnectUrl('twitter', mockUserId, 'http://localhost:5000')
      ).rejects.toThrow(new AppError(
        'SocialFlow is not configured for twitter. Add its client credentials to the server environment.',
        503
      ));
    });

    it('should throw 400 for an unsupported platform', async () => {
      await expect(
        socialService.getConnectUrl('myspace', mockUserId, 'http://localhost:5000')
      ).rejects.toThrow(AppError);
    });
  });

  describe('handleCallback', () => {
    it('should refuse the callback when the provider is not configured (provider check runs first)', async () => {
      await expect(
        socialService.handleCallback('twitter', 'code123', 'unknown_state', 'http://localhost:5000')
      ).rejects.toThrow(new AppError(
        'SocialFlow is not configured for twitter. Add its client credentials to the server environment.',
        503
      ));
    });
  });

  describe('listAccounts', () => {
    it('should retrieve connected accounts without exposing tokens', async () => {
      mockSocialRepository.findAccountsForWorkspaceMember.mockResolvedValue([mockSocialAccount]);

      const result = await socialService.listAccounts(mockUserId);

      expect(mockSocialRepository.findAccountsForWorkspaceMember).toHaveBeenCalledWith(mockUserId, undefined);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('_id', 'sa_999');
      expect(result[0]).toHaveProperty('platform', 'twitter');
      expect(result[0]).not.toHaveProperty('encryptedAccessToken');
      expect(result[0]).not.toHaveProperty('encryptedRefreshToken');
    });
  });

  describe('disconnectAccount', () => {
    it('should delete the account and cascade its data when the user owns it', async () => {
      mockSocialRepository.findAccountById.mockResolvedValue(mockSocialAccount);
      mockSocialRepository.deleteAccount.mockResolvedValue(true);
      mockSocialRepository.deleteCascadeData.mockResolvedValue(undefined);

      await socialService.disconnectAccount('sa_999', mockUserId);

      expect(mockSocialRepository.findAccountById).toHaveBeenCalledWith('sa_999');
      expect(mockSocialRepository.deleteAccount).toHaveBeenCalledWith('sa_999');
      expect(mockSocialRepository.deleteCascadeData).toHaveBeenCalledWith('sa_999');
    });

    it('should throw forbidden AppError if the user does not own the connection', async () => {
      mockSocialRepository.findAccountById.mockResolvedValue(mockSocialAccount);

      await expect(
        socialService.disconnectAccount('sa_999', 'wrong_user_id')
      ).rejects.toThrow(new AppError('Unauthorized access to this social account', 403));
    });

    it('should throw notFound AppError if the account does not exist', async () => {
      mockSocialRepository.findAccountById.mockResolvedValue(null);

      await expect(
        socialService.disconnectAccount('sa_999', mockUserId)
      ).rejects.toThrow(new AppError('Social account not found', 404));
    });
  });

  describe('resolveAccountTokenBundle — undecryptable tokens', () => {
    it('flags the account expired and throws a 401 ProviderError when the stored token cannot be decrypted', async () => {
      const staleAccount = {
        ...mockSocialAccount,
        _id: 'sa_stale',
        connectionId: 'conn_1',
        encryptedAccessToken: 'deadbeef:unreadable-ciphertext',
      };
      mockSocialRepository.findAccountById.mockResolvedValue(staleAccount as any);
      mockSocialRepository.updateAccount.mockResolvedValue(staleAccount as any);
      mockConnectionRepository.setStatus.mockResolvedValue(undefined as any);

      await expect(socialService.resolveAccountTokenBundle('sa_stale')).rejects.toMatchObject({
        name: 'ProviderError',
        status: 401,
        providerCode: 'TOKEN_UNREADABLE',
      });

      expect(mockSocialRepository.updateAccount).toHaveBeenCalledWith(
        'sa_stale',
        expect.objectContaining({ connectionStatus: 'expired', status: 'error' })
      );
      expect(mockConnectionRepository.setStatus).toHaveBeenCalledWith(
        'conn_1',
        'expired',
        expect.stringContaining('reconnect')
      );
    });

    it('still throws the auth-expired AppError when there is nothing to decrypt', async () => {
      const emptyAccount = { ...mockSocialAccount, _id: 'sa_empty', encryptedAccessToken: undefined };
      mockSocialRepository.findAccountById.mockResolvedValue(emptyAccount as any);

      await expect(socialService.resolveAccountTokenBundle('sa_empty')).rejects.toMatchObject({
        code: 'PROVIDER_AUTH_EXPIRED',
      });
    });
  });
});
