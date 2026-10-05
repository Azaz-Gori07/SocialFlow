import PostModel, { IPost, IDelivery, PostStatus } from './post.model';

export interface PaginatedPostsResult {
  items: IPost[];
  total: number;
  limit: number;
  offset: number;
}

export class PostRepository {
  async findPostById(id: string): Promise<IPost | null> {
    return PostModel.findById(id).exec();
  }

  async findByDraftId(draftId: string): Promise<IPost | null> {
    return PostModel.findOne({ draftId } as any).exec();
  }

  async findPostsByUserId(userId: string): Promise<IPost[]> {
    return PostModel.find({ userId } as any).exec();
  }

  async findPostsByUserIdPaginated(
    userId: string,
    options: { limit: number; offset: number; status?: string }
  ): Promise<PaginatedPostsResult> {
    const query: any = { userId };
    if (options.status) {
      // Partial successes belong to the published history: the UI shows them
      // with an explicit `partial_failure` badge instead of hiding them from
      // every filter tab.
      query.status =
        options.status === 'published' ? { $in: ['published', 'partial_failure'] } : options.status;
    }

    const [items, total] = await Promise.all([
      PostModel.find(query)
        .sort({ createdAt: -1 })
        .skip(options.offset)
        .limit(options.limit)
        .exec(),
      PostModel.countDocuments(query).exec()
    ]);

    return {
      items,
      total,
      limit: options.limit,
      offset: options.offset
    };
  }

  async createPost(postData: Partial<IPost>): Promise<IPost> {
    const post = new PostModel(postData);
    return post.save();
  }

  async updatePost(id: string, postData: Partial<IPost>): Promise<IPost | null> {
    // `setDefaultsOnInsert` only affects inserts, but Mongoose still applies schema
    // defaults to the hydrated update document. Without `omitUndefined`+a strict
    // field list, a partial update silently writes `status: 'draft'` (the schema
    // default) over a scheduled post. Only the fields the caller actually
    // supplied are written; nothing else is touched.
    const allowed: (keyof IPost)[] = [
      'content',
      'platforms',
      'media',
      'platformContent',
      'status',
      'scheduledAt',
      'failedReason',
      'deliveries',
      'targetAccountIds'
    ];
    const $set: Record<string, unknown> = {};
    for (const field of allowed) {
      if (postData[field] !== undefined) $set[field] = postData[field];
    }
    if (Object.keys($set).length === 0) {
      return PostModel.findById(id).exec();
    }
    return PostModel.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true }).exec();
  }

  async deletePost(id: string): Promise<boolean> {
    const result = await PostModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  /**
   * Guideline §20 — atomic claim of a due post.
   * Only one scheduler instance wins the transition scheduled -> publishing.
   */
  async claimDuePost(id: string, nowIso: string): Promise<IPost | null> {
    return PostModel.findOneAndUpdate(
      { _id: id, status: 'scheduled', scheduledAt: { $lte: nowIso } },
      { $set: { status: 'publishing', lastAttemptAt: nowIso } },
      { new: true }
    ).exec();
  }

  /** Due posts whose scheduled time has passed. */
  async findDuePosts(nowIso: string): Promise<IPost[]> {
    return PostModel.find({
      status: 'scheduled',
      scheduledAt: { $lte: nowIso }
    } as any)
      .sort({ scheduledAt: 1 })
      .exec();
  }

  /** Posts with failed deliveries eligible for retry (backoff elapsed, attempts left). */
  async findRetryablePosts(nowIso: string): Promise<IPost[]> {
    return PostModel.find({
      deliveries: { $elemMatch: { status: 'failed', deadLettered: { $ne: true }, nextRetryAt: { $lte: nowIso } } }
    } as any)
      .sort({ updatedAt: 1 })
      .exec();
  }

  /**
   * Guideline §20 — atomic claim of a single delivery.
   * Transitions pending|failed -> publishing; only one runner wins per delivery.
   * Dead-lettered deliveries are excluded so a permanent failure is never retried.
   */
  async claimDelivery(
    postId: string,
    socialAccountId: string,
    nowIso: string
  ): Promise<IPost | null> {
    return PostModel.findOneAndUpdate(
      {
        _id: postId,
        deliveries: {
          $elemMatch: { socialAccountId, status: { $in: ['pending', 'failed'] }, deadLettered: { $ne: true } }
        }
      },
      {
        $set: {
          'deliveries.$[d].status': 'publishing',
          'deliveries.$[d].nextRetryAt': undefined,
          lastAttemptAt: nowIso
        }
      },
      { arrayFilters: [{ 'd.socialAccountId': socialAccountId, 'd.deadLettered': { $ne: true } }], new: true }
    ).exec();
  }

  /** Persists the delivery outcome after an engine run. */
  async updateDeliveryResult(
    postId: string,
    socialAccountId: string,
    update: Partial<IDelivery>
  ): Promise<IPost | null> {
    return PostModel.findOneAndUpdate(
      { _id: postId, 'deliveries.socialAccountId': socialAccountId },
      { $set: Object.fromEntries(Object.entries(update).map(([k, v]) => [`deliveries.$.${k}`, v])) },
      { new: true }
    ).exec();
  }

  /** Recomputes the post-level status from delivery states (guideline §18). */
  deriveStatus(deliveries: IDelivery[]): PostStatus {
    const statuses = deliveries.map(d => d.status);
    if (statuses.length === 0) return 'failed';
    if (statuses.every(s => s === 'published')) return 'published';
    if (statuses.some(s => s === 'published')) return 'partial_failure';
    if (statuses.every(s => s === 'failed')) return 'failed';
    return 'publishing';
  }

  /**
   * Settles the post once every delivery reached a terminal state
   * (published / partial_failure / failed) or is still running.
   */
  async settlePost(postId: string, status: PostStatus, nowIso: string): Promise<IPost | null> {
    const set: Record<string, unknown> = { status, updatedAt: nowIso };
    if (status === 'published') set.publishedAt = nowIso;
    if (status === 'failed') set.failedReason = 'All deliveries failed';
    return PostModel.findByIdAndUpdate(postId, { $set: set }, { new: true }).exec();
  }

  /**
   * Stale-lock recovery: publishing posts older than the cutoff return to
   * scheduled. Only deliveries that never reached a terminal state are reclaimed —
   * resetting `published` or dead-lettered deliveries would republish content that
   * already went out.
   */
  async releaseStaleClaims(cutoffIso: string, nowIso: string): Promise<number> {
    const result = await PostModel.updateMany(
      { status: 'publishing', lastAttemptAt: { $lt: cutoffIso } } as any,
      {
        $set: {
          status: 'scheduled',
          'deliveries.$[d].status': 'pending',
          'deliveries.$[d].nextRetryAt': undefined,
          updatedAt: nowIso
        }
      },
      { arrayFilters: [{ 'd.status': { $nin: ['published', 'failed'] } }] }
    ).exec();
    return result.modifiedCount || 0;
  }
}
export default PostRepository;
