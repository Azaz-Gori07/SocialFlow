import ProjectHistoryModel, { IProjectHistory } from './projectHistory.model';
import { PostVariant } from '../content/prompts';

const RETURNING_DAYS_THRESHOLD = 14;

export class ProjectHistoryService {
  async getHistory(userId: string, repositoryId: string): Promise<IProjectHistory> {
    let history = await ProjectHistoryModel.findOne({ userId, repositoryId }).exec();
    if (!history) {
      history = await ProjectHistoryModel.create({
        userId,
        repositoryId,
        totalPostsPublished: 0,
        publishedDraftIds: [],
        topicsCovered: []
      });
    }
    return history;
  }

  async recordPublishedPost(
    userId: string,
    repositoryId: string,
    draftId: string,
    topics?: string[]
  ): Promise<IProjectHistory> {
    const update: Record<string, unknown> = {
      $inc: { totalPostsPublished: 1 },
      $set: { lastPostedAt: new Date() },
      $addToSet: { publishedDraftIds: draftId }
    };
    if (topics && topics.length > 0) {
      (update as any).$addToSet = {
        ...((update as any).$addToSet || {}),
        topicsCovered: { $each: topics }
      };
    }
    const updated = await ProjectHistoryModel.findOneAndUpdate(
      { userId, repositoryId },
      update,
      { upsert: true, returnDocument: 'after' }
    ).exec();
    return updated as IProjectHistory;
  }

  async recommendVariant(
    userId: string,
    repositoryId: string,
    opts?: { isMilestone?: boolean; activityCount?: number }
  ): Promise<PostVariant> {
    const history = await this.getHistory(userId, repositoryId);
    if (!history || history.totalPostsPublished === 0) {
      return 'first_post';
    }

    if (history.lastPostedAt) {
      const daysSinceLastPost = (Date.now() - new Date(history.lastPostedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastPost >= RETURNING_DAYS_THRESHOLD) {
        return 'returning';
      }
    }

    if (opts?.isMilestone) {
      return 'single_milestone';
    }

    if (opts?.activityCount && opts.activityCount > 1) {
      return 'day_summary';
    }

    return 'story';
  }
}

export const projectHistoryService = new ProjectHistoryService();
