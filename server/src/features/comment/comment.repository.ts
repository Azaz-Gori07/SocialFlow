import CommentModel, { IComment, ICommentReply } from './comment.model';

export interface CommentFilters {
  platform?: string;
  status?: string;
  assignedTo?: string;
}

export class CommentRepository {
  async findCommentsByWorkspaceId(workspaceId: string, filters: CommentFilters): Promise<IComment[]> {
    const query: Record<string, unknown> = { workspaceId };
    if (filters.platform) query.platform = filters.platform;
    if (filters.status === 'assigned') {
      query.assignedTo = { $exists: true, $nin: [null, ''] };
    } else if (filters.status) {
      query.status = filters.status;
    }
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;

    return CommentModel.find(query as any).sort({ createdAt: -1 }).exec();
  }

  async findCommentsByAccountIds(
    accountIds: string[],
    filters: CommentFilters
  ): Promise<IComment[]> {
    const query: Record<string, unknown> = { accountId: { $in: accountIds } };
    if (filters.platform) query.platform = filters.platform;
    if (filters.status === 'assigned') {
      query.assignedTo = { $exists: true, $nin: [null, ''] };
    } else if (filters.status) {
      query.status = filters.status;
    }
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;

    return CommentModel.find(query as any).sort({ createdAt: -1 }).exec();
  }

  async findCommentById(id: string): Promise<IComment | null> {
    return CommentModel.findById(id).exec();
  }

  /** Dedupe upsert keyed by (workspaceId, platform, externalCommentId). */
  async upsertComment(comment: Partial<IComment>): Promise<IComment> {
    const existing = await CommentModel.findOne({
      workspaceId: comment.workspaceId,
      platform: comment.platform,
      externalCommentId: comment.externalCommentId
    } as any).exec();

    if (existing) {
      const updated = await CommentModel.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            message: comment.message,
            author: comment.author,
            postTitle: comment.postTitle,
            externalPostId: comment.externalPostId,
            externalAccountId: comment.externalAccountId,
            updatedAt: new Date().toISOString()
          }
        },
        { new: true }
      ).exec();
      if (!updated) throw new Error('Comment upsert failed');
      return updated;
    }

    return CommentModel.create(comment as any);
  }

  async updateComment(id: string, updateData: Partial<IComment>): Promise<IComment | null> {
    return CommentModel.findByIdAndUpdate(
      id,
      { $set: { ...updateData, updatedAt: new Date().toISOString() } },
      { new: true }
    ).exec();
  }

  async pushReply(commentId: string, reply: ICommentReply): Promise<IComment | null> {
    return CommentModel.findByIdAndUpdate(
      commentId,
      {
        $push: { replies: reply },
        $set: { status: 'resolved', updatedAt: new Date().toISOString() }
      },
      { new: true }
    ).exec();
  }
}
export default CommentRepository;
