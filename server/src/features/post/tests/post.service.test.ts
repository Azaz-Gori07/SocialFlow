import { PostService } from '../post.service';
import { PostRepository } from '../post.repository';
import { SocialRepository } from '../../social/social.repository';
import { AppError } from '../../../shared/errors/appError';

jest.mock('../post.repository');
jest.mock('../../social/social.repository');

describe('PostService Unit Tests', () => {
  let postService: PostService;
  let mockPostRepository: jest.Mocked<PostRepository>;
  let mockSocialRepository: jest.Mocked<SocialRepository>;

  const mockUserId = 'usr_alex_123';
  const mockAccount = { _id: 'acc_twitter_1', platform: 'twitter' };
  const mockPost: any = {
    _id: 'pst_111',
    userId: mockUserId,
    platforms: ['twitter'],
    content: 'Hello World Post',
    status: 'draft',
    media: [],
    platformContent: {}
  };

  beforeEach(() => {
    mockPostRepository = new PostRepository() as jest.Mocked<PostRepository>;
    mockSocialRepository = new SocialRepository() as jest.Mocked<SocialRepository>;
    postService = new PostService(mockPostRepository, mockSocialRepository);
    jest.clearAllMocks();
    mockSocialRepository.findAccountsByUserId.mockResolvedValue([mockAccount] as any);
  });

  describe('createPost', () => {
    it('should create a draft without scheduling (scheduling is DB-driven)', async () => {
      mockPostRepository.createPost.mockResolvedValue(mockPost);

      const result = await postService.createPost({
        content: 'Hello World Post',
        platforms: ['twitter'],
        status: 'draft'
      } as any, mockUserId);

      expect(mockPostRepository.createPost).toHaveBeenCalledWith({
        userId: mockUserId,
        content: 'Hello World Post',
        platforms: ['twitter'],
        status: 'draft',
        media: [],
        platformContent: undefined,
        scheduledAt: undefined,
        // New posts always record provenance; 'manual' unless a real
        // AI/CSV/auto-schedule flow says otherwise.
        source: 'manual',
        deliveries: []
      });
      expect(result).toBe(mockPost);
    });

    it('should derive scheduled status when scheduledAt is provided', async () => {
      const scheduledTime = new Date(Date.now() + 3600 * 1000).toISOString();
      const scheduledPost = { ...mockPost, status: 'scheduled', scheduledAt: scheduledTime };
      mockPostRepository.createPost.mockResolvedValue(scheduledPost);

      const result = await postService.createPost({
        content: 'Hello World Post',
        platforms: ['twitter'],
        scheduledAt: scheduledTime
      } as any, mockUserId);

      expect(mockPostRepository.createPost).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'scheduled', scheduledAt: scheduledTime })
      );
      expect(result.status).toBe('scheduled');
    });

    // Regression: a scheduled post with zero deliveries is claimed by the
    // scheduler, and deriveStatus([]) settles it as `failed`.
    it('creates one pending delivery per connected account when scheduling', async () => {
      const scheduledTime = new Date(Date.now() + 3600 * 1000).toISOString();
      mockPostRepository.createPost.mockResolvedValue(mockPost);

      await postService.createPost({
        content: 'Scheduled',
        platforms: ['twitter'],
        scheduledAt: scheduledTime
      } as any, mockUserId);

      const arg = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(arg.deliveries).toHaveLength(1);
      expect(arg.deliveries[0]).toMatchObject({
        socialAccountId: 'acc_twitter_1',
        platform: 'twitter',
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        deadLettered: false
      });
      expect(arg.deliveries[0].idempotencyKey).toMatch(/^post:[a-f0-9]{24}:acc_twitter_1:1$/);
    });

    it('fans out one delivery per account across multiple platforms', async () => {
      mockSocialRepository.findAccountsByUserId.mockResolvedValue([
        { _id: 'acc_tw', platform: 'twitter' },
        { _id: 'acc_li', platform: 'linkedin' },
        { _id: 'acc_ig', platform: 'instagram' }
      ] as any);
      mockPostRepository.createPost.mockResolvedValue(mockPost);

      await postService.createPost({
        content: 'Multi',
        platforms: ['twitter', 'linkedin'],
        scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString()
      } as any, mockUserId);

      const arg = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(arg.deliveries.map((d: any) => d.platform).sort()).toEqual(['linkedin', 'twitter']);
      const keys = arg.deliveries.map((d: any) => d.idempotencyKey);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('refuses to schedule when no connected account matches the platforms', async () => {
      mockSocialRepository.findAccountsByUserId.mockResolvedValue([] as any);

      await expect(postService.createPost({
        content: 'Orphan',
        platforms: ['twitter'],
        scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString()
      } as any, mockUserId)).rejects.toThrow(AppError);

      expect(mockPostRepository.createPost).not.toHaveBeenCalled();
    });
  });

  describe('updatePost', () => {
    it('should update a scheduled post back to draft', async () => {
      const scheduledPost = { ...mockPost, status: 'scheduled', scheduledAt: new Date().toISOString() };
      const draftPost = { ...mockPost, status: 'draft' };
      mockPostRepository.findPostById.mockResolvedValue(scheduledPost);
      mockPostRepository.updatePost.mockResolvedValue(draftPost);

      const result = await postService.updatePost('pst_111', { status: 'draft' }, mockUserId);

      expect(mockPostRepository.updatePost).toHaveBeenCalledWith('pst_111', { status: 'draft' });
      expect(result.status).toBe('draft');
    });

    it('should throw AppError badRequest if attempting to update a published post', async () => {
      const publishedPost = { ...mockPost, status: 'published' };
      mockPostRepository.findPostById.mockResolvedValue(publishedPost);

      await expect(
        postService.updatePost('pst_111', { content: 'New Content' }, mockUserId)
      ).rejects.toThrow(new AppError('Published posts cannot be edited', 400));
    });

    it('should throw forbidden if the post belongs to another user', async () => {
      mockPostRepository.findPostById.mockResolvedValue(mockPost);

      await expect(
        postService.updatePost('pst_111', { content: 'New Content' }, 'other_user')
      ).rejects.toThrow(new AppError('Insufficient permissions to modify this post', 403));
    });
  });

  describe('deletePost', () => {
    it('should delete the post', async () => {
      mockPostRepository.findPostById.mockResolvedValue(mockPost);
      mockPostRepository.deletePost.mockResolvedValue(true);

      const result = await postService.deletePost('pst_111', mockUserId);

      expect(mockPostRepository.deletePost).toHaveBeenCalledWith('pst_111');
      expect(result).toBe(true);
    });
  });
});
