import { PostRepository } from './post.repository';
import { PostScheduler } from '../../services/queue/post.scheduler';
import { AppError } from '../../shared/errors/appError';
import { IPost } from './post.model';
import { CreatePostInput, UpdatePostInput } from './post.validation';

export interface ListPostsOptions {
  limit: number;
  offset: number;
  status?: string;
}

export interface PaginatedPosts {
  items: IPost[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export class PostService {
  constructor(private postRepository: PostRepository) {}

  /**
   * Creates and registers a new post (draft or scheduled)
   */
  async createPost(input: CreatePostInput, userId: string): Promise<IPost> {
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
      await PostScheduler.schedule(post._id.toString(), post.scheduledAt);
    }

    return post;
  }

  /**
   * Updates an existing post and coordinates queue updates
   */
  async updatePost(id: string, input: UpdatePostInput, userId: string): Promise<IPost> {
    const post = await this.postRepository.findPostById(id);
    if (!post) {
      throw AppError.notFound('Post not found');
    }

    if (post.userId !== userId) {
      throw AppError.forbidden('Insufficient permissions to modify this post');
    }

    if (post.status === 'published') {
      throw AppError.badRequest('Published posts cannot be edited');
    }

    // Capture old schedule state
    const wasScheduled = post.status === 'scheduled';
    const oldScheduledAt = post.scheduledAt;

    // Build update object
    const updateData: Partial<IPost> = {};
    if (input.content !== undefined) updateData.content = input.content;
    if (input.platforms !== undefined) updateData.platforms = input.platforms;
    if (input.media !== undefined) updateData.media = input.media;
    if (input.platformContent !== undefined) updateData.platformContent = input.platformContent;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.scheduledAt !== undefined) updateData.scheduledAt = input.scheduledAt;

    // Apply updates to DB
    const updatedPost = await this.postRepository.updatePost(id, updateData);
    if (!updatedPost) {
      throw AppError.internal('Failed to update post');
    }

    // Coordinate Queue Adjustments
    const isNowScheduled = updatedPost.status === 'scheduled';
    const newScheduledAt = updatedPost.scheduledAt;

    if (wasScheduled && !isNowScheduled) {
      // Status changed: Cancel delayed job
      await PostScheduler.cancel(id);
    } else if (isNowScheduled) {
      // Re-schedule: Cancel old job and add new one
      await PostScheduler.cancel(id);
      if (newScheduledAt) {
        await PostScheduler.schedule(id, newScheduledAt);
      }
    }

    return updatedPost;
  }

  /**
   * Retrieves single post details
   */
  async getPost(id: string, userId: string): Promise<IPost> {
    const post = await this.postRepository.findPostById(id);
    if (!post) {
      throw AppError.notFound('Post not found');
    }

    if (post.userId !== userId) {
      throw AppError.forbidden('Insufficient permissions to access this post');
    }

    return post;
  }

  /**
   * Lists all posts for a user
   */
  async listPosts(userId: string): Promise<IPost[]> {
    return this.postRepository.findPostsByUserId(userId);
  }

  /**
   * P1.7: Lists posts with pagination support.
   * Returns items + total + hasMore for client-side pagination.
   */
  async listPostsPaginated(
    userId: string,
    options: ListPostsOptions
  ): Promise<PaginatedPosts> {
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
  async deletePost(id: string, userId: string): Promise<boolean> {
    const post = await this.postRepository.findPostById(id);
    if (!post) {
      throw AppError.notFound('Post not found');
    }

    if (post.userId !== userId) {
      throw AppError.forbidden('Insufficient permissions to delete this post');
    }

    // Cancel delayed queue job
    await PostScheduler.cancel(id);

    // Delete post record
    return this.postRepository.deletePost(id);
  }
}
export default PostService;
