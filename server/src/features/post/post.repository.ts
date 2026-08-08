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
      query.status = options.status;
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
    return PostModel.findByIdAndUpdate(id, { $set: postData }, { new: true }).exec();
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
      deliveries: { $elemMatch: { status: 'failed', nextRetryAt: { $lte: nowIso } } }
    } as any)
      .sort({ updatedAt: 1 })
      .exec();
  }

  /**
   * Guideline §20 — atomic claim of a single delivery.
   * Transitions pending|failed -> publishing; only one runner wins per delivery.
   */
  async claimDelivery(
    postId: string,
    socialAccountId: string,
    nowIso: string
  ): Promise<IPost | null> {
    return PostModel.findOneAndUpdate(
      {
        _id: postId,
        deliveries: { $elemMatch: { socialAccountId, status: { $in: ['pending', 'failed'] } } }
      },
      {
        $set: {
          'deliveries.$[d].status': 'publishing',
          'deliveries.$[d].nextRetryAt': undefined,
          lastAttemptAt: nowIso
        }
      },
      { arrayFilters: [{ 'd.socialAccountId': socialAccountId }], new: true }
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

  /** Stale-lock recovery: publishing posts older than the cutoff return to scheduled. */
  async releaseStaleClaims(cutoffIso: string, nowIso: string): Promise<number> {
    const result = await PostModel.updateMany(
      { status: 'publishing', lastAttemptAt: { $lt: cutoffIso } } as any,
      { $set: { status: 'scheduled', 'deliveries.$[].status': 'pending', updatedAt: nowIso } }
    ).exec();
    return result.modifiedCount || 0;
  }
}
export default PostRepository;
