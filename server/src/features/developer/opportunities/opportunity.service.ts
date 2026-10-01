import { AppError } from '../../../shared/errors/appError';
import { OpportunityRepository } from './opportunity.repository';
import { IDeveloperOpportunity, DeveloperOpportunityStatus } from './opportunity.model';
import { IDeveloperActivity } from '../activities/activity.model';
import { ActivityService } from '../activities/activity.service';
import { RepositoryService } from '../repositories/repository.service';
import { isOpportunityCandidate } from '../content/idea-detector';

export interface DetectOptions {
  /**
   * Initial-sync flood guard: a repository that has never synced has a backlog,
   * not news. Those opportunities are stored as 'baseline' so they are analysed
   * but never enter automatic generation.
   */
  baseline?: boolean;
  /** Restrict detection to these activities (new work only). */
  activityIds?: string[];
}

export interface OpportunityListFilter {
  repositoryId?: string;
  status?: DeveloperOpportunityStatus;
  limit?: number;
  offset?: number;
}

export interface OpportunityListResult {
  items: IDeveloperOpportunity[];
  total: number;
  limit: number;
  offset: number;
}

/** Statuses a client may set. 'baseline' is set by the pipeline, never by a user. */
export const USER_SETTABLE_STATUSES: DeveloperOpportunityStatus[] = [
  'pending',
  'generated',
  'skipped',
  'rejected'
];

/**
 * Storage gate. Deliberately narrower than `isOpportunityCandidate`
 * (content/idea-detector.ts): only work that is LinkedIn-worthy, a milestone, or
 * HIGH importance is queued. The looser candidate rule stays with the content
 * phase so a queued backlog is never a generated backlog.
 */
export function isWorthyActivity(activity: IDeveloperActivity): boolean {
  return !!activity.linkedInWorthy
    || !!activity.isMilestone
    || activity.importance === 'HIGH'
    || activity.importance === 'MILESTONE';
}

export class OpportunityService {
  constructor(
    private opportunityRepository: OpportunityRepository,
    private activityService: ActivityService,
    private repositoryService: RepositoryService
  ) {}

  /**
   * Persist a content opportunity for every worthy activity in a repository.
   * Read-before-write on (repositoryId, sourceId) keeps re-runs idempotent; the
   * unique index is the race-safe backstop.
   */
  async detectAndStore(
    userId: string,
    repositoryId: string,
    opts?: DetectOptions
  ): Promise<{ created: number; items: IDeveloperOpportunity[] }> {
    await this.repositoryService.getById(userId, repositoryId);

    const activities = opts?.activityIds
      ? await this.activityService.findByIds(userId, opts.activityIds)
      : await this.activityService.listByRepository(userId, repositoryId);

    const created: IDeveloperOpportunity[] = [];
    for (const activity of activities) {
      const existing = await this.opportunityRepository.findBySource(repositoryId, activity._id.toString());
      if (existing) continue;
      if (!isWorthyActivity(activity)) continue;

      const { opportunity, created: didCreate } = await this.opportunityRepository.create({
        userId,
        repositoryId,
        activityId: activity._id.toString(),
        title: activity.title,
        summary: (activity.changes ?? []).join('\n') || undefined,
        sourceType: activity.isMilestone ? 'milestone' : 'activity',
        sourceId: activity._id.toString(),
        status: opts?.baseline ? 'baseline' : 'pending',
        metadata: {
          importance: activity.importance,
          importanceScore: activity.importanceScore,
          evidence: activity.evidence
        }
      });
      if (didCreate) created.push(opportunity);
    }
    return { created: created.length, items: created };
  }

  async list(userId: string, filter: OpportunityListFilter): Promise<OpportunityListResult> {
    const limit = filter.limit ?? 20;
    const offset = filter.offset ?? 0;
    if (filter.repositoryId) {
      await this.repositoryService.getById(userId, filter.repositoryId);
    }
    const [items, total] = await Promise.all([
      this.opportunityRepository.list({ userId, ...filter, limit, offset }),
      this.opportunityRepository.count({
        userId,
        repositoryId: filter.repositoryId,
        status: filter.status
      })
    ]);
    return { items, total, limit, offset };
  }

  async updateStatus(userId: string, opportunityId: string, status: DeveloperOpportunityStatus): Promise<IDeveloperOpportunity> {
    const opportunity = await this.opportunityRepository.findOwned(userId, opportunityId);
    if (!opportunity) throw AppError.notFound('Opportunity not found');
    if (!USER_SETTABLE_STATUSES.includes(status)) {
      throw AppError.badRequest('Invalid opportunity status');
    }
    await this.opportunityRepository.updateStatus(opportunityId, status);
    opportunity.set({ status });
    return opportunity;
  }

  /** Re-exported so callers have one import for the content-phase candidate rule. */
  static isOpportunityCandidate = isOpportunityCandidate;
}

export default OpportunityService;
