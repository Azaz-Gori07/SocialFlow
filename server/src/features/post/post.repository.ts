import PostModel, { IPost } from './post.model';

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

  async findPostsByUserId(userId: string): Promise<IPost[]> {
    return PostModel.find({ userId } as any).exec();
  }

  /**
   * P1.7: Paginated posts query.
   * Returns items + total count for client-side pagination.
   */
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
    return PostModel.findByIdAndUpdate(
      id,
      { $set: postData },
      { new: true }
    ).exec();
  }

  async deletePost(id: string): Promise<boolean> {
    const result = await PostModel.findByIdAndDelete(id).exec();
    return !!result;
  }
}
export default PostRepository;
