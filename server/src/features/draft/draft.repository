import DraftModel, { IDraft, DraftPlatform, DraftStatus } from './draft.model';

export interface PaginatedDraftsResult {
  items: IDraft[];
  total: number;
  limit: number;
  offset: number;
}

type DraftQuery = Record<string, unknown>;

export class DraftRepository {
  async findById(id: string): Promise<IDraft | null> {
    return DraftModel.findById(id).exec();
  }

  async findByUserId(userId: string): Promise<IDraft[]> {
    return DraftModel.find({ userId } as DraftQuery).sort({ createdAt: -1 }).exec();
  }

  async findByUserIdAndPlatform(
    userId: string,
    platform: string
  ): Promise<IDraft[]> {
    return DraftModel.find({ userId, platform } as DraftQuery)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findPaginated(
    userId: string,
    options: {
      limit: number;
      offset: number;
      platform?: string;
      status?: string;
    }
  ): Promise<PaginatedDraftsResult> {
    const query: DraftQuery = { userId };
    if (options.platform) {
      query.platform = options.platform;
    }
    if (options.status) {
      query.status = options.status;
    }

    const [items, total] = await Promise.all([
      DraftModel.find(query as DraftQuery)
        .sort({ createdAt: -1 })
        .skip(options.offset)
        .limit(options.limit)
        .exec(),
      DraftModel.countDocuments(query as DraftQuery).exec()
    ]);

    return {
      items,
      total,
      limit: options.limit,
      offset: options.offset
    };
  }

  // Phase 2: Find ready drafts for a specific platform (used by per-platform schedulers)
  async findReadyByPlatform(platform: string, limit = 10): Promise<IDraft[]> {
    return DraftModel.find({
      platform,
      status: 'ready'
    } as DraftQuery)
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  // Phase 2: Find failed drafts eligible for retry
  async findFailedForRetry(platform: string, maxRetries = 3): Promise<IDraft[]> {
    return DraftModel.find({
      platform,
      status: 'failed',
      retryCount: { $lt: maxRetries }
    } as DraftQuery)
      .sort({ lastAttemptAt: 1 })
      .limit(10)
      .exec();
  }

  async create(draftData: Partial<IDraft>): Promise<IDraft> {
    const draft = new DraftModel(draftData);
    return draft.save();
  }

  async update(id: string, draftData: Partial<IDraft>): Promise<IDraft | null> {
    return DraftModel.findByIdAndUpdate(
      id,
      { $set: draftData },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await DraftModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async archive(id: string): Promise<IDraft | null> {
    return DraftModel.findByIdAndUpdate(
      id,
      { $set: { status: 'archived' } },
      { new: true }
    ).exec();
  }

  async incrementRetryCount(id: string): Promise<IDraft | null> {
    return DraftModel.findByIdAndUpdate(
      id,
      { $inc: { retryCount: 1 } },
      { new: true }
    ).exec();
  }

  // Phase 2: Mark as publishing with timestamp
  async markPublishing(id: string): Promise<IDraft | null> {
    return DraftModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'publishing',
          lastAttemptAt: new Date().toISOString()
        }
      },
      { new: true }
    ).exec();
  }

  // Phase 2: Mark as published with platform response
  async markPublished(
    id: string,
    platformResponse: { postId?: string; url?: string; platform: string; raw?: any }
  ): Promise<IDraft | null> {
    return DraftModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'published',
          publishedAt: new Date().toISOString(),
          platformResponse,
          errorMessage: null
        }
      },
      { new: true }
    ).exec();
  }

  // Phase 2: Mark as failed with error details
  async markFailed(
    id: string,
    errorMessage: string
  ): Promise<IDraft | null> {
    return DraftModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'failed',
          failedReason: errorMessage,
          errorMessage,
          lastAttemptAt: new Date().toISOString()
        },
        $inc: { retryCount: 1 }
      },
      { new: true }
    ).exec();
  }
}

export default DraftRepository;