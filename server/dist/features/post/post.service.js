"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostService = void 0;
const post_scheduler_1 = require("../../services/queue/post.scheduler");
const appError_1 = require("../../shared/errors/appError");
class PostService {
    postRepository;
    constructor(postRepository) {
        this.postRepository = postRepository;
    }
    /**
     * Creates and registers a new post (draft or scheduled)
     */
    async createPost(input, userId) {
        const post = await this.postRepository.createPost({
            userId,
            platforms: input.platforms,
            content: input.content,
            media: input.media,
            platformContent: input.platformContent,
            status: input.status,
            scheduledAt: input.scheduledAt
        });
        // If post is scheduled, add to the Delayed Queue
        if (post.status === 'scheduled' && post.scheduledAt) {
            await post_scheduler_1.PostScheduler.schedule(post._id.toString(), post.scheduledAt);
        }
        return post;
    }
    /**
     * Updates an existing post and coordinates queue updates
     */
    async updatePost(id, input, userId) {
        const post = await this.postRepository.findPostById(id);
        if (!post) {
            throw appError_1.AppError.notFound('Post not found');
        }
        if (post.userId !== userId) {
            throw appError_1.AppError.forbidden('Insufficient permissions to modify this post');
        }
        if (post.status === 'published') {
            throw appError_1.AppError.badRequest('Published posts cannot be edited');
        }
        // Capture old schedule state
        const wasScheduled = post.status === 'scheduled';
        const oldScheduledAt = post.scheduledAt;
        // Build update object
        const updateData = {};
        if (input.content !== undefined)
            updateData.content = input.content;
        if (input.platforms !== undefined)
            updateData.platforms = input.platforms;
        if (input.media !== undefined)
            updateData.media = input.media;
        if (input.platformContent !== undefined)
            updateData.platformContent = input.platformContent;
        if (input.status !== undefined)
            updateData.status = input.status;
        if (input.scheduledAt !== undefined)
            updateData.scheduledAt = input.scheduledAt;
        // Apply updates to DB
        const updatedPost = await this.postRepository.updatePost(id, updateData);
        if (!updatedPost) {
            throw appError_1.AppError.internal('Failed to update post');
        }
        // Coordinate Queue Adjustments
        const isNowScheduled = updatedPost.status === 'scheduled';
        const newScheduledAt = updatedPost.scheduledAt;
        if (wasScheduled && !isNowScheduled) {
            // Status changed: Cancel delayed job
            await post_scheduler_1.PostScheduler.cancel(id);
        }
        else if (isNowScheduled) {
            // Re-schedule: Cancel old job and add new one
            await post_scheduler_1.PostScheduler.cancel(id);
            if (newScheduledAt) {
                await post_scheduler_1.PostScheduler.schedule(id, newScheduledAt);
            }
        }
        return updatedPost;
    }
    /**
     * Retrieves single post details
     */
    async getPost(id, userId) {
        const post = await this.postRepository.findPostById(id);
        if (!post) {
            throw appError_1.AppError.notFound('Post not found');
        }
        if (post.userId !== userId) {
            throw appError_1.AppError.forbidden('Insufficient permissions to access this post');
        }
        return post;
    }
    /**
     * Lists all posts for a user
     */
    async listPosts(userId) {
        return this.postRepository.findPostsByUserId(userId);
    }
    /**
     * P1.7: Lists posts with pagination support.
     * Returns items + total + hasMore for client-side pagination.
     */
    async listPostsPaginated(userId, options) {
        const { limit, offset, status } = options;
        const result = await this.postRepository.findPostsByUserIdPaginated(userId, {
            limit,
            offset,
            status
        });
        return {
            ...result,
            hasMore: offset + result.items.length < result.total
        };
    }
    /**
     * Cancels queues and deletes the post
     */
    async deletePost(id, userId) {
        const post = await this.postRepository.findPostById(id);
        if (!post) {
            throw appError_1.AppError.notFound('Post not found');
        }
        if (post.userId !== userId) {
            throw appError_1.AppError.forbidden('Insufficient permissions to delete this post');
        }
        // Cancel delayed queue job
        await post_scheduler_1.PostScheduler.cancel(id);
        // Delete post record
        return this.postRepository.deletePost(id);
    }
}
exports.PostService = PostService;
exports.default = PostService;
