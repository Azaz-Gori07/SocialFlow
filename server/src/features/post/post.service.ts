import { PostRepository } from './post.repository';
import { SocialRepository } from '../social/social.repository';
import { resolveTargetAccounts } from '../social/targeting';
import { AppError } from '../../shared/errors/appError';
import { IDelivery, IPost, IPostMediaRef } from './post.model';
import { ISocialAccount } from '../social/social.model';
import { CreatePostInput, UpdatePostInput } from './post.validation';
import { logActivity } from '../../shared/utils/activityLog';
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
   *
   * Targeting: explicit `targetAccountIds` are validated server-side (never
   * trusted from the client) and persisted as the post's target snapshot;
   * absent `targetAccountIds` keeps the legacy fan-out for old clients.
   */
  async createPost(input: CreatePostInput, userId: string): Promise<IPost> {
    const effectiveStatus = input.scheduledAt ? 'scheduled' : (input.status || 'draft');
    const explicit = input.targetAccountIds !== undefined;

    let targets: ISocialAccount[] = [];
    if (explicit && (input.targetAccountIds!.length > 0 || effectiveStatus === 'scheduled')) {
      // Explicit targeting — validated at save time; the fan-out confirmation
      // gate only applies once the post actually goes onto the schedule.
      targets = await this.resolveTargets(userId, input, input.platforms, {
        fanoutConfirmed: effectiveStatus === 'scheduled' ? input.confirmFanout === true : true
      });
    } else if (!explicit && effectiveStatus === 'scheduled') {
      // Legacy fan-out: every connected account of the requested platforms.
      targets = await this.resolveTargets(userId, input, input.platforms, { fanoutConfirmed: true });
      if (targets.length === 0) {
        throw AppError.badRequest(
          `No connected account found for: ${input.platforms.join(', ')}. Connect an account before scheduling.`
        );
      }
    }

    const deliveries = effectiveStatus === 'scheduled' ? this.toDeliveries(targets) : [];

    const post = await this.postRepository.createPost({
      userId,
      platforms: input.platforms,
      content: input.content,
      media: toMediaRefs(input.media || []),
      platformContent: input.platformContent,
      status: effectiveStatus,
      scheduledAt: input.scheduledAt,
      ...(explicit ? { targetAccountIds: input.targetAccountIds } : {}),
      source: input.source ?? 'manual',
      deliveries
    });

    // Audit trail: TARGET_ASSIGNED whenever explicit targets were set,
    // CONTENT_SCHEDULED whenever the post went onto the schedule.
    if (explicit && Array.isArray(post.targetAccountIds) && post.targetAccountIds.length > 0) {
      await logActivity({
        userId,
        workspaceId: input.workspaceId,
        action: 'TARGET_ASSIGNED',
        details: `Assigned ${post.targetAccountIds.length} account(s) for ${input.platforms.join(', ')}`,
        meta: {
          postId: post._id.toString(),
          platforms: input.platforms,
          targetAccountIds: post.targetAccountIds,
          source: input.source ?? 'manual',
          actor: userId,
          workspaceId: input.workspaceId
        }
      });
    }
    if (effectiveStatus === 'scheduled') {
      const scheduledTargets =
        (Array.isArray(post.targetAccountIds) && post.targetAccountIds.length > 0
          ? post.targetAccountIds
          : deliveries.map((d) => d.socialAccountId));
      await logActivity({
        userId,
        workspaceId: input.workspaceId,
        action: 'CONTENT_SCHEDULED',
        details: `Scheduled ${input.platforms.join(', ')} post for ${scheduledTargets.length} account(s) at ${input.scheduledAt}`,
        meta: {
          postId: post._id.toString(),
          scheduledAt: input.scheduledAt,
          targetAccountIds: scheduledTargets,
          source: input.source ?? 'manual',
          actor: userId,
          workspaceId: input.workspaceId
        }
      });
    }

    return post;
  }

  /**
   * Resolves delivery targets through the shared targeting module. Explicit
   * targeting requires the active workspace and re-validates every id
   * (ownership, workspace, platform, connection); the legacy path
   * (targetAccountIds absent) fans out to all matching accounts.
   */
  private async resolveTargets(
    userId: string,
    input: { workspaceId?: string; targetAccountIds?: string[] },
    platforms: string[],
    opts: { fanoutConfirmed: boolean }
  ): Promise<ISocialAccount[]> {
    const { accounts } = await resolveTargetAccounts(
      {
        userId,
        platforms,
        targetAccountIds: input.targetAccountIds,
        workspaceId: input.workspaceId,
        requireWorkspace: true,
        fanoutConfirmed: opts.fanoutConfirmed
      },
      { socialRepository: this.socialRepository }
    );
    return accounts;
  }

  /**
   * One pending delivery per target account with its idempotency key —
   * mirrors DraftPublisher's construction so both publishing paths produce
   * identical delivery semantics.
   */
  private toDeliveries(
    targets: ISocialAccount[],
    postId: string = new mongoose.Types.ObjectId().toString(),
    scheduledAttempt = 1
  ): IDelivery[] {
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

    const nextStatus = (updateData.status as IPost['status'] | undefined) ?? post.status;
    const becomesScheduled = nextStatus === 'scheduled';
    const platforms = input.platforms ?? post.platforms;

    // --- Account-level targeting (snapshot semantics) ---
    if (input.targetAccountIds !== undefined) {
      const ids = input.targetAccountIds;
      if (ids.length === 0) {
        // An empty array is never "publish everywhere".
        if (becomesScheduled) {
          throw AppError.badRequest('Select at least one account to schedule this post to.');
        }
        updateData.targetAccountIds = [];
      } else {
        const targets = await this.resolveTargets(userId, input, platforms, {
          fanoutConfirmed: becomesScheduled ? input.confirmFanout === true : true
        });
        updateData.targetAccountIds = ids;
        this.applyDeliverySnapshot(post, targets, becomesScheduled, updateData);
      }
    } else if (becomesScheduled && (!post.deliveries || post.deliveries.length === 0)) {
      // Arming a post that has no deliveries yet: build them from the stored
      // snapshot (explicit) or legacy fan-out so the scheduler never runs
      // against an empty delivery set.
      const stored = post.targetAccountIds;
      if (stored !== undefined && stored.length === 0) {
        throw AppError.badRequest('Select at least one account to schedule this post to.');
      }
      const targets = await this.resolveTargets(
        userId,
        { workspaceId: input.workspaceId, targetAccountIds: stored },
        platforms,
        { fanoutConfirmed: input.confirmFanout === true }
      );
      if (targets.length === 0) {
        throw AppError.badRequest(
          `No connected account found for: ${platforms.join(', ')}. Connect an account before scheduling.`
        );
      }
      updateData.deliveries = this.toDeliveries(targets, post._id.toString(), post.scheduledAttempt);
    }

    // Apply updates to DB
    const updatedPost = await this.postRepository.updatePost(id, updateData);
    if (!updatedPost) {
      throw AppError.internal('Failed to update post');
    }

    // Audit: explicit target change
    if (Array.isArray(updateData.targetAccountIds) && updateData.targetAccountIds.length > 0) {
      const before = [...(post.targetAccountIds || [])].sort().join(',');
      const after = [...updateData.targetAccountIds].sort().join(',');
      if (before !== after) {
        await logActivity({
          userId,
          workspaceId: input.workspaceId,
          action: 'TARGET_ASSIGNED',
          details: `Re-targeted post to ${updateData.targetAccountIds.length} account(s)`,
          meta: {
            postId: post._id.toString(),
            platforms,
            targetAccountIds: updateData.targetAccountIds,
            source: post.source ?? 'manual',
            actor: userId,
            workspaceId: input.workspaceId
          }
        });
      }
    }

    // Audit: transitioned onto the schedule
    if (updateData.status === 'scheduled' && post.status !== 'scheduled') {
      const scheduledTargets = Array.isArray(updateData.targetAccountIds)
        ? updateData.targetAccountIds
        : Array.isArray(post.targetAccountIds) && post.targetAccountIds.length > 0
          ? post.targetAccountIds
          : ((updateData.deliveries as any[]) || post.deliveries || []).map((d: any) => d.socialAccountId);
      await logActivity({
        userId,
        workspaceId: input.workspaceId,
        action: 'CONTENT_SCHEDULED',
        details: `Scheduled ${platforms.join(', ')} post for ${scheduledTargets.length} account(s) at ${updateData.scheduledAt ?? post.scheduledAt}`,
        meta: {
          postId: post._id.toString(),
          scheduledAt: updateData.scheduledAt ?? post.scheduledAt,
          targetAccountIds: scheduledTargets,
          source: post.source ?? 'manual',
          actor: userId,
          workspaceId: input.workspaceId
        }
      });
    }

    return updatedPost;
  }

  /**
   * Keeps deliveries in sync with an explicit target change. The snapshot is
   * immutable once any delivery attempt exists; before that a changed target
   * set rebuilds the pending deliveries. Unchanged targets never touch
   * deliveries, so scheduling state and idempotency keys survive edits.
   */
  private applyDeliverySnapshot(
    post: IPost,
    targets: ISocialAccount[],
    becomesScheduled: boolean,
    updateData: Partial<IPost>
  ): void {
    const current = (post.deliveries || []) as unknown as IDelivery[];

    if (current.length === 0) {
      // Drafts keep their snapshot until they are actually scheduled.
      if (becomesScheduled) {
        if (targets.length === 0) {
          throw AppError.badRequest('Select at least one account to schedule this post to.');
        }
        updateData.deliveries = this.toDeliveries(targets, post._id.toString(), post.scheduledAttempt);
      }
      return;
    }

    const currentIds = current.map((d) => d.socialAccountId).sort();
    const nextIds = targets.map((t) => t._id.toString()).sort();
    const unchanged =
      currentIds.length === nextIds.length && currentIds.every((v, i) => v === nextIds[i]);
    if (unchanged) return;

    const attempted = current.some((d) => d.attempts > 0 || d.status !== 'pending');
    if (attempted) {
      throw AppError.badRequest(
        'Target accounts cannot be changed after publishing has started. Create a new post instead.'
      );
    }

    updateData.deliveries = this.toDeliveries(targets, post._id.toString(), post.scheduledAttempt);
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
   * Bulk creates multiple scheduled posts (CSV flow).
   *
   * Rows may carry `accountHandles` (from the CSV `account_handle` column).
   * Handles are resolved to SocialAccounts HERE, server-side, with row-tagged
   * errors; nothing is created unless every row validates — a bad handle never
   * silently falls back to "all connected accounts".
   */
  async bulkCreatePosts(
    inputs: (CreatePostInput & { accountHandles?: string[] })[],
    userId: string
  ): Promise<IPost[]> {
    const needsResolution = inputs.some((i) => Array.isArray(i.accountHandles) && i.accountHandles.length > 0);

    if (needsResolution) {
      const accounts = (await this.socialRepository.findAccountsByUserId(userId)) as any[];
      const byHandle = new Map(accounts.map((a) => [String(a.username).toLowerCase(), a]));
      const rowErrors: string[] = [];

      inputs.forEach((input, idx) => {
        const row = idx + 1;
        const handles = input.accountHandles;
        if (!Array.isArray(handles) || handles.length === 0) return;

        const resolved: string[] = [];
        for (const rawHandle of handles) {
          const handle = String(rawHandle).trim().toLowerCase();
          const acc = byHandle.get(handle);
          if (!acc) {
            rowErrors.push(`Row ${row}: unknown account handle "@${handle}"`);
            continue;
          }
          if (acc.status !== 'active' || acc.connectionStatus !== 'connected') {
            rowErrors.push(`Row ${row}: account "@${acc.username}" is not connected`);
            continue;
          }
          resolved.push(acc._id.toString());
        }

        if (resolved.length > 0 && !input.workspaceId) {
          rowErrors.push(`Row ${row}: workspaceId is required when account handles are used`);
        }

        input.targetAccountIds = [...new Set([...(input.targetAccountIds || []), ...resolved])];
        delete input.accountHandles;
      });

      if (rowErrors.length > 0) {
        throw AppError.badRequest(
          `Bulk scheduling rejected — fix these rows:\n${rowErrors.join('\n')}`,
          rowErrors
        );
      }
    }

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
