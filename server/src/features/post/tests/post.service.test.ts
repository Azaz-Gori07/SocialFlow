import { PostService } from '../post.service';
import { PostRepository } from '../post.repository';
import { AppError } from '../../../shared/errors/appError';

jest.mock('../post.repository');

describe('PostService Unit Tests', () => {
  let postService: PostService;
  let mockPostRepository: jest.Mocked<PostRepository>;

  const mockUserId = 'usr_alex_123';
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
    postService = new PostService(mockPostRepository);
    jest.clearAllMocks();
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
        scheduledAt: undefined
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
