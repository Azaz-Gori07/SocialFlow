"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const post_service_1 = require("../post.service");
const post_repository_1 = require("../post.repository");
const post_scheduler_1 = require("../../../services/queue/post.scheduler");
const appError_1 = require("../../../shared/errors/appError");
jest.mock('../post.repository');
jest.mock('../../../services/queue/post.scheduler');
describe('PostService Unit Tests', () => {
    let postService;
    let mockPostRepository;
    const mockUserId = 'usr_alex_123';
    const mockPost = {
        _id: 'pst_111',
        userId: mockUserId,
        platforms: ['twitter'],
        content: 'Hello World Post',
        status: 'draft',
        media: [],
        platformContent: {}
    };
    beforeEach(() => {
        mockPostRepository = new post_repository_1.PostRepository();
        postService = new post_service_1.PostService(mockPostRepository);
        jest.clearAllMocks();
    });
    describe('createPost', () => {
        it('should create a draft successfully without scheduling delayed jobs', async () => {
            mockPostRepository.createPost.mockResolvedValue(mockPost);
            const result = await postService.createPost({
                content: 'Hello World Post',
                platforms: ['twitter'],
                status: 'draft'
            }, mockUserId);
            expect(mockPostRepository.createPost).toHaveBeenCalledWith({
                userId: mockUserId,
                content: 'Hello World Post',
                platforms: ['twitter'],
                status: 'draft',
                media: undefined,
                platformContent: undefined
            });
            expect(post_scheduler_1.PostScheduler.schedule).not.toHaveBeenCalled();
            expect(result).toBe(mockPost);
        });
        it('should create and schedule post delayed job if status is scheduled', async () => {
            const scheduledTime = new Date(Date.now() + 3600 * 1000).toISOString();
            const scheduledPost = { ...mockPost, status: 'scheduled', scheduledAt: scheduledTime };
            mockPostRepository.createPost.mockResolvedValue(scheduledPost);
            const result = await postService.createPost({
                content: 'Hello World Post',
                platforms: ['twitter'],
                status: 'scheduled',
                scheduledAt: scheduledTime
            }, mockUserId);
            expect(mockPostRepository.createPost).toHaveBeenCalled();
            expect(post_scheduler_1.PostScheduler.schedule).toHaveBeenCalledWith('pst_111', scheduledTime);
            expect(result.status).toBe('scheduled');
        });
    });
    describe('updatePost', () => {
        it('should update draft successfully and cancel scheduling if status changes to draft', async () => {
            const scheduledPost = { ...mockPost, status: 'scheduled', scheduledAt: new Date().toISOString() };
            mockPostRepository.findPostById.mockResolvedValue(scheduledPost);
            mockPostRepository.updatePost.mockResolvedValue(mockPost); // returns draft
            const result = await postService.updatePost('pst_111', {
                status: 'draft'
            }, mockUserId);
            expect(post_scheduler_1.PostScheduler.cancel).toHaveBeenCalledWith('pst_111');
            expect(result.status).toBe('draft');
        });
        it('should throw AppError badRequest if attempting to update a published post', async () => {
            const publishedPost = { ...mockPost, status: 'published' };
            mockPostRepository.findPostById.mockResolvedValue(publishedPost);
            await expect(postService.updatePost('pst_111', { content: 'New Content' }, mockUserId)).rejects.toThrow(new appError_1.AppError('Published posts cannot be edited', 400));
        });
    });
    describe('deletePost', () => {
        it('should cancel schedule job and delete post', async () => {
            mockPostRepository.findPostById.mockResolvedValue(mockPost);
            mockPostRepository.deletePost.mockResolvedValue(true);
            const result = await postService.deletePost('pst_111', mockUserId);
            expect(post_scheduler_1.PostScheduler.cancel).toHaveBeenCalledWith('pst_111');
            expect(mockPostRepository.deletePost).toHaveBeenCalledWith('pst_111');
            expect(result).toBe(true);
        });
    });
});
