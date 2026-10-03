import { PostRepository } from './post.repository';
import { SocialRepository } from '../social/social.repository';
import { AppError } from '../../shared/errors/appError';
import { IDelivery, IPost, IPostMediaRef } from './post.model';
import { CreatePostInput, UpdatePostInput } from './post.validation';
import mongoose from 'mongoose';

/** Maps client-provided media URLs to post media refs (kind inferred from URL). */
function toMediaRefs(media: string[]): IPostMediaRef[] {
  return media.map(url => ({
    url,
    kind: /\.(mp4|mov|webm|mkv)(\?|$)/i.test(url) ? 'video' : 'image'
  }));
}

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
  constructor(
    private postRepository: PostRepository,
    private socialRepository: SocialRepository = new SocialRepository()
  ) {}

  /**
   * Creates and registers a new post (draft or scheduled)
   */
  async createPost(input: CreatePostInput, userId: string): Promise<IPost> {
    const effectiveStatus = input.scheduledAt ? 'scheduled' : (input.status || 'draft');

    // A scheduled post needs one delivery per connected account: the scheduler
    // claims a post, iterates its deliveries, and deriveStatus([]) settles the
    // post as `failed`. Unscheduled posts stay inert until scheduled later.
    const deliveries = effectiveStatus === 'scheduled' ? await this.buildDeliveries(input, userId) : [];

    const post = await this.postRepository.createPost({
      userId,
      platforms: input.platforms,
      content: input.content,
      media: toMediaRefs(input.media || []),
      platformContent: input.platformContent,
      status: effectiveStatus,
      scheduledAt: input.scheduledAt,
      deliveries
    });

    return post;
  }

  /**
   * Fans a scheduled post out into one pending delivery per connected account of
   * every requested platform. Mirrors DraftPublisher's construction so both
   * publishing paths produce identical delivery semantics.
   */
  private async buildDeliveries(input: CreatePostInput, userId: string): Promise<IDelivery[]> {
    const accounts = (await this.socialRepository.findAccountsByUserId(userId)) as any[];
    const wanted = new Set(input.platforms);
    const targets = accounts.filter((a) => a.platform && wanted.has(a.platform));

    if (targets.length === 0) {
      throw AppError.badRequest(
        `No connected account found for: ${input.platforms.join(', ')}. Connect an account before scheduling.`
      );
    }

    const postId = new mongoose.Types.ObjectId().toString();
    const scheduledAttempt = 1;

    return targets.map((acc) => ({
      socialAccountId: acc._id.toString(),
      platform: acc.platform,
      status: 'pending',
      idempotencyKey: `post:${postId}:${acc._id.toString()}:${scheduledAttempt}`,
      attempts: 0,
      maxAttempts: 5,
      deadLettered: false
    })) as unknown as IDelivery[];
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
    if (input.media !== undefined) updateData.media = toMediaRefs(input.media || []);
    if (input.platformContent !== undefined) updateData.platformContent = input.platformContent;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.scheduledAt !== undefined) updateData.scheduledAt = input.scheduledAt;

    // Setting or moving the schedule time re-arms the post for the scheduler.
    // Without this the post keeps `draft` and the scheduler never picks it up.
    // A publish in flight is never dragged back into the queue.
    if (input.scheduledAt !== undefined && input.status === undefined) {
      const stillPending = post.status === 'draft' || post.status === 'failed' || wasScheduled;
      if (stillPending) updateData.status = 'scheduled';
    }

    // Apply updates to DB
    const updatedPost = await this.postRepository.updatePost(id, updateData);
    if (!updatedPost) {
      throw AppError.internal('Failed to update post');
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
   * Bulk creates multiple scheduled posts
   */
  async bulkCreatePosts(inputs: CreatePostInput[], userId: string): Promise<IPost[]> {
    const posts: IPost[] = [];
    for (const input of inputs) {
      const post = await this.createPost(input, userId);
      posts.push(post);
    }
    return posts;
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

    // Delete post record
    return this.postRepository.deletePost(id);
  }
}
export default PostService;
