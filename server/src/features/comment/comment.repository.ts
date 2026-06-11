import CommentModel, { IComment, ICommentReply } from './comment.model';

export class CommentRepository {
  async findCommentsByAccountIds(
    accountIds: string[],
    filters: { platform?: string; status?: string; assignedTo?: string }
  ): Promise<IComment[]> {
    const query: any = { accountId: { $in: accountIds } };
    
    if (filters.platform) {
      query.platform = filters.platform;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.assignedTo) {
      query.assignedTo = filters.assignedTo;
    }

    // Sort newest first
    return CommentModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findCommentById(id: string): Promise<IComment | null> {
    return CommentModel.findById(id).exec();
  }

  async updateComment(id: string, updateData: Partial<IComment>): Promise<IComment | null> {
    return CommentModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async pushReply(commentId: string, reply: ICommentReply): Promise<IComment | null> {
    return CommentModel.findByIdAndUpdate(
      commentId,
      { 
        $push: { replies: reply },
        $set: { status: 'resolved' } // auto resolve upon reply
      },
      { new: true }
    ).exec();
  }
}
export default CommentRepository;
