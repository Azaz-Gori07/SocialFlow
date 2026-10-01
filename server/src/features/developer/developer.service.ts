import { Model } from 'mongoose';
import { env } from '../../shared/config/env.config';
import { logger } from '../../shared/utils/logger';
import DeveloperRepositoryModel from './repositories/repository.model';
import DeveloperCommitModel from './commits/commit.model';
import DeveloperActivityModel from './activities/activity.model';
import DeveloperMemoryModel from './memory/memory.model';
import DeveloperOpportunityModel from './opportunities/opportunity.model';
import { ConnectionService } from './connections/connection.service';
import { RepositoryService } from './repositories/repository.service';
import { SyncService } from './sync/sync.service';
import { ActivityService } from './activities/activity.service';
import { MemoryService } from './memory/memory.service';
import { OpportunityService } from './opportunities/opportunity.service';
import { PipelineService } from './intelligence/pipeline.service';
import { SettingsRepository } from './settings/settings.repository';
import { SettingsService } from './settings/settings.service';
import { ContentService } from './content/content.service';

export interface DeveloperStatus {
  enabled: boolean;
}

export interface DeveloperOverview {
  enabled: boolean;
  repositories: number;
  commits: number;
  activities: number;
  memory: number;
  opportunities: number;
}

type Query = Record<string, unknown>;

export class DeveloperService {
  constructor(
    public connectionService: ConnectionService,
    public repositoryService: RepositoryService,
    public syncService: SyncService,
    public activityService: ActivityService,
    public memoryService: MemoryService,
    public opportunityService: OpportunityService,
    public pipelineService: PipelineService,
    public settingsService: SettingsService,
    public contentService: ContentService
  ) {}

  /**
   * Whether the Developer Intelligence feature is switched on.
   * Read live from env so a restart with DEVELOPER_FLOW_ENABLED=true is enough;
   * no config reload path exists in this phase.
   */
  getStatus(): DeveloperStatus {
    return { enabled: env.developerFlowEnabled };
  }

  /**
   * Dashboard counters. Each block is counted independently and degrades to 0 on
   * error, so one collection problem cannot blank the whole overview.
   */
  async getOverview(userId: string): Promise<DeveloperOverview> {
    const count = async (model: Model<any>, extra: Query = {}): Promise<number> => {
      try {
        return await model.countDocuments({ userId, ...extra }).exec();
      } catch (error) {
        logger.error('[developer] overview count failed', {
          model: model.modelName,
          error: error instanceof Error ? error.message : String(error)
        });
        return 0;
      }
    };
    const [repositories, commits, activities, memory, opportunities] = await Promise.all([
      count(DeveloperRepositoryModel),
      count(DeveloperCommitModel),
      count(DeveloperActivityModel),
      count(DeveloperMemoryModel, { status: 'active' }),
      count(DeveloperOpportunityModel)
    ]);
    return { enabled: env.developerFlowEnabled, repositories, commits, activities, memory, opportunities };
  }
}

export default DeveloperService;
