import DailyWindowModel, { IDailyWindow } from './dailyWindow.model';
import DeveloperRepositoryModel from '../repositories/repository.model';
import DeveloperActivityModel from '../activities/activity.model';
import DeveloperSettingsModel from '../settings/settings.model';
import { OpportunityRepository } from '../opportunities/opportunity.repository';
import { ContentService } from '../content/content.service';
import { projectHistoryService } from '../repositories/projectHistory.service';
import { logger } from '../../../shared/utils/logger';

export class DailyContentService {
  constructor(
    private opportunityRepository: OpportunityRepository,
    private contentService: ContentService
  ) {}

  isWindowDue(now = new Date(), settings?: { dailyWindowEndHour?: number; dailyWindowEndMinute?: number }): boolean {
    const endH = settings?.dailyWindowEndHour ?? 17;
    const endM = settings?.dailyWindowEndMinute ?? 30;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    return hours > endH || (hours === endH && minutes >= endM);
  }

  getDateKey(date = new Date()): string {
    return date.toISOString().slice(0, 10);
  }

  calculateScheduledTime(
    now = new Date(),
    settings?: { dailyPublishHour?: number; dailyPublishMinute?: number }
  ): Date {
    const pubH = settings?.dailyPublishHour ?? 18;
    const pubM = settings?.dailyPublishMinute ?? 0;
    const scheduled = new Date(now);
    scheduled.setHours(pubH, pubM, 0, 0);
    if (scheduled.getTime() <= now.getTime()) {
      // If already past publish time, schedule 30 minutes from now
      scheduled.setTime(now.getTime() + 30 * 60 * 1000);
    }
    return scheduled;
  }

  async processDailyWindowForRepo(
    userId: string,
    repositoryId: string,
    targetDate = new Date()
  ): Promise<{ status: string; draftId?: string }> {
    const userSettings = await DeveloperSettingsModel.findOne({ userId }).lean().exec();
    const windowDate = this.getDateKey(targetDate);
    const existing = await DailyWindowModel.findOne({ userId, repositoryId, windowDate }).exec();
    if (existing && existing.status === 'processed') {
      return { status: 'already_processed', draftId: existing.draftId };
    }

    // Find pending opportunities for this repository
    const pending = await this.opportunityRepository.list({
      userId,
      repositoryId,
      status: 'pending',
      limit: 10,
      offset: 0
    });

    if (pending.length === 0) {
      await DailyWindowModel.findOneAndUpdate(
        { userId, repositoryId, windowDate },
        {
          $set: {
            aggregatedAt: new Date(),
            scheduledFor: this.calculateScheduledTime(targetDate, userSettings || undefined),
            status: 'skipped',
            activityIds: []
          }
        },
        { upsert: true }
      ).exec();
      return { status: 'skipped' };
    }

    const activityIds = pending.map((p) => p.activityId);
    const scheduledFor = this.calculateScheduledTime(targetDate, userSettings || undefined);

    // Pick primary opportunity (e.g. highest importance or most recent)
    const primaryOpportunity = pending[0];
    const generated = await this.contentService.generateForOpportunity(
      userId,
      primaryOpportunity._id.toString()
    );

    const firstDraft = generated.drafts[0];
    const draftId = firstDraft?.id;

    await DailyWindowModel.findOneAndUpdate(
      { userId, repositoryId, windowDate },
      {
        $set: {
          aggregatedAt: new Date(),
          scheduledFor,
          draftId,
          status: 'processed',
          activityIds
        }
      },
      { upsert: true }
    ).exec();

    logger.info('[developer] daily window processed for repository', {
      repositoryId,
      windowDate,
      draftId,
      opportunitiesCount: pending.length
    });

    return { status: 'processed', draftId };
  }

  async processAllDueDailyWindows(now = new Date()): Promise<number> {
    if (!this.isWindowDue(now)) return 0;

    let processedCount = 0;
    try {
      const repos = await DeveloperRepositoryModel.find({
        aiMonitoring: true,
        lastSyncedAt: { $ne: null }
      }).select('_id userId').lean().exec();

      for (const repo of repos) {
        try {
          const settings = await DeveloperSettingsModel.findOne({ userId: repo.userId }).lean().exec();
          if (!settings || (!settings.autoContent && !settings.autoPublish)) continue;

          const res = await this.processDailyWindowForRepo(repo.userId, String(repo._id), now);
          if (res.status === 'processed') processedCount++;
        } catch (err) {
          logger.error('[developer] daily window error for repo', {
            repositoryId: String(repo._id),
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
    } catch (err) {
      logger.error('[developer] processAllDueDailyWindows error', {
        error: err instanceof Error ? err.message : String(err)
      });
    }

    return processedCount;
  }
}
