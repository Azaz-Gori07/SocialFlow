import PublishHistoryModel, { IPublishHistory, PublishOutcome } from './publishHistory.model';
import { DraftPlatform } from './draft.model';

export class PublishHistoryRepository {
  async recordAttempt(data: {
    draftId: string;
    userId: string;
    platform: DraftPlatform;
    attemptNumber: number;
    outcome: PublishOutcome;
    statusBefore: string;
    statusAfter: string;
    publishedAt?: string;
    platformResponse?: { postId?: string; url?: string; platform: string; raw?: any };
    errorMessage?: string;
    errorStack?: string;
  }): Promise<IPublishHistory> {
    const record = new PublishHistoryModel(data);
    return record.save();
  }

  async findByDraftId(draftId: string): Promise<IPublishHistory[]> {
    return PublishHistoryModel.find({ draftId })
      .sort({ attemptNumber: -1 })
      .exec();
  }

  async findLatestByDraftId(draftId: string): Promise<IPublishHistory | null> {
    return PublishHistoryModel.findOne({ draftId })
      .sort({ attemptNumber: -1 })
      .exec();
  }

  async findByUserId(
    userId: string,
    options: { limit?: number; offset?: number; platform?: string }
  ): Promise<{ items: IPublishHistory[]; total: number }> {
    const query: Record<string, unknown> = { userId };
    if (options.platform) {
      query.platform = options.platform;
    }

    const [items, total] = await Promise.all([
      PublishHistoryModel.find(query)
        .sort({ createdAt: -1 })
        .skip(options.offset || 0)
        .limit(options.limit || 50)
        .exec(),
      PublishHistoryModel.countDocuments(query).exec()
    ]);

    return { items, total };
  }

  async getNextAttemptNumber(draftId: string): Promise<number> {
    const last = await PublishHistoryModel.findOne({ draftId })
      .sort({ attemptNumber: -1 })
      .select('attemptNumber')
      .exec();
    return (last?.attemptNumber || 0) + 1;
  }
}

export default PublishHistoryRepository;