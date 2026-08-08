import { processDuePosts, processRetries, cleanupStaleLocks } from '../scheduler';
import { NotificationType } from '../../features/notification/notification.types';
import { db } from '../../database/db';

// Explicit mock factories: the scheduler instantiates its dependencies at
// module scope, so these shared objects must be the exact instances it uses.
// (var + hoisted assignment: the factories run during the scheduler import,
// before the test module body executes.)

jest.mock('../../features/post/post.repository', () => {
  (globalThis as any).__schedMocks = (globalThis as any).__schedMocks || {};
  const repo = {
    findDuePosts: jest.fn(),
    findRetryablePosts: jest.fn(),
    claimDuePost: jest.fn(),
    claimDelivery: jest.fn(),
    findPostById: jest.fn(),
    deriveStatus: jest.fn(),
    settlePost: jest.fn(),
    releaseStaleClaims: jest.fn()
  };
  (globalThis as any).__schedMocks.postRepo = repo;
  return { PostRepository: jest.fn().mockImplementation(() => repo), default: jest.fn().mockImplementation(() => repo) };
});
jest.mock('../../features/social/social.repository', () => ({
  SocialRepository: jest.fn().mockImplementation(() => ({})),
  default: jest.fn().mockImplementation(() => ({}))
}));
jest.mock('../social/delivery.engine', () => {
  (globalThis as any).__schedMocks = (globalThis as any).__schedMocks || {};
  const engine = { publishDelivery: jest.fn() };
  (globalThis as any).__schedMocks.deliveryEngine = engine;
  return { DeliveryEngine: jest.fn().mockImplementation(() => engine) };
});
jest.mock('../../features/notification/notification.service', () => {
  (globalThis as any).__schedMocks = (globalThis as any).__schedMocks || {};
  const notification = { create: jest.fn() };
  (globalThis as any).__schedMocks.notification = notification;
  return { NotificationService: jest.fn().mockImplementation(() => notification) };
});
jest.mock('../../database/db', () => ({
  db: { activityLogs: { create: jest.fn().mockResolvedValue({}) } }
}));
jest.mock('../../shared/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

describe('SchedulerService Unit Tests', () => {
  const postRepoMock = (globalThis as any).__schedMocks.postRepo;
  const deliveryEngineMock = (globalThis as any).__schedMocks.deliveryEngine;
  const notificationMock = (globalThis as any).__schedMocks.notification;

  const mockPost: any = {
    _id: 'pst_1',
    userId: 'user_1',
    platforms: ['twitter'],
    content: 'Scheduled content',
    status: 'publishing',
    draftId: undefined,
    deliveries: [
      { socialAccountId: 'sa_1', platform: 'twitter', status: 'pending', attempts: 0 }
    ]
  };

  const failedPost: any = {
    ...mockPost,
    deliveries: [
      {
        socialAccountId: 'sa_1',
        platform: 'twitter',
        status: 'failed',
        attempts: 2,
        lastError: 'rate limited'
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    postRepoMock.findDuePosts.mockResolvedValue([]);
    postRepoMock.findRetryablePosts.mockResolvedValue([]);
    postRepoMock.releaseStaleClaims.mockResolvedValue(0);
    (db.activityLogs.create as jest.Mock).mockResolvedValue({});
  });

  describe('processDuePosts', () => {
    it('should publish due posts and settle them as published with a notification', async () => {
      postRepoMock.findDuePosts.mockResolvedValue([mockPost]);
      postRepoMock.claimDuePost.mockResolvedValue(mockPost);
      postRepoMock.claimDelivery.mockResolvedValue(mockPost);
      deliveryEngineMock.publishDelivery.mockResolvedValue({ ok: true, externalPostId: 'x_1' });
      postRepoMock.findPostById.mockResolvedValue(mockPost);
      postRepoMock.deriveStatus.mockReturnValue('published');
      postRepoMock.settlePost.mockResolvedValue(mockPost);

      await processDuePosts();

      expect(postRepoMock.claimDuePost).toHaveBeenCalledWith('pst_1', expect.any(String));
      expect(deliveryEngineMock.publishDelivery).toHaveBeenCalledWith(
        mockPost,
        expect.objectContaining({ socialAccountId: 'sa_1', status: 'pending' })
      );
      expect(postRepoMock.settlePost).toHaveBeenCalledWith('pst_1', 'published', expect.any(String));
      expect(db.activityLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'POST_PUBLISHED_AUTOMATIC' })
      );
      expect(notificationMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.POST_PUBLISHED })
      );
    });

    it('should skip a post already claimed by another instance', async () => {
      postRepoMock.findDuePosts.mockResolvedValue([mockPost]);
      postRepoMock.claimDuePost.mockResolvedValue(null);

      await processDuePosts();

      expect(deliveryEngineMock.publishDelivery).not.toHaveBeenCalled();
      expect(postRepoMock.settlePost).not.toHaveBeenCalled();
    });

    it('should settle as failed and notify when the provider rejects the delivery', async () => {
      postRepoMock.findDuePosts.mockResolvedValue([mockPost]);
      postRepoMock.claimDuePost.mockResolvedValue(mockPost);
      postRepoMock.claimDelivery.mockResolvedValue(mockPost);
      deliveryEngineMock.publishDelivery.mockRejectedValue(new Error('provider rejected'));
      postRepoMock.findPostById.mockResolvedValue(mockPost);
      postRepoMock.deriveStatus.mockReturnValue('failed');
      postRepoMock.settlePost.mockResolvedValue(mockPost);

      await processDuePosts();

      expect(postRepoMock.settlePost).toHaveBeenCalledWith('pst_1', 'failed', expect.any(String));
      expect(notificationMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.POST_FAILED })
      );
    });
  });

  describe('processRetries', () => {
    it('should retry failed deliveries whose backoff has elapsed', async () => {
      postRepoMock.findRetryablePosts.mockResolvedValue([failedPost]);
      postRepoMock.claimDelivery.mockResolvedValue(failedPost);
      deliveryEngineMock.publishDelivery.mockResolvedValue({ ok: true, externalPostId: 'x_2' });
      postRepoMock.findPostById.mockResolvedValue(failedPost);
      postRepoMock.deriveStatus.mockReturnValue('published');
      postRepoMock.settlePost.mockResolvedValue(failedPost);

      await processRetries();

      expect(deliveryEngineMock.publishDelivery).toHaveBeenCalledWith(
        failedPost,
        expect.objectContaining({ socialAccountId: 'sa_1', status: 'failed' })
      );
      expect(postRepoMock.settlePost).toHaveBeenCalledWith('pst_1', 'published', expect.any(String));
    });
  });

  describe('cleanupStaleLocks', () => {
    it('should release stale claims', async () => {
      postRepoMock.releaseStaleClaims.mockResolvedValue(2);

      await cleanupStaleLocks();

      expect(postRepoMock.releaseStaleClaims).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String)
      );
    });
  });
});
