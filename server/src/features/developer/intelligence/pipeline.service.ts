import { ActivityService, IntelligenceResult } from '../activities/activity.service';
import { MemoryService } from '../memory/memory.service';
import { OpportunityService } from '../opportunities/opportunity.service';
import { SettingsRepository } from '../settings/settings.repository';
import { resolveSettings } from '../settings/settings.service';

export interface PipelineResult extends IntelligenceResult {
  memoryWritten: number;
  newOpportunities: number;
  baseline: boolean;
}

/**
 * Intelligence → memory → opportunities for one repository.
 *
 * The same composition is used by the manual route and by scheduled/worker
 * runs, so there is exactly one definition of "a pipeline pass". Detection is
 * idempotent at every stage: a second pass with no new commits produces no new
 * activities, no new memory rows, and no new opportunities.
 */
export class PipelineService {
  constructor(
    private activityService: ActivityService,
    private memoryService: MemoryService,
    private opportunityService: OpportunityService,
    private settingsRepository: SettingsRepository
  ) {}

  async runPipelineForRepository(
    userId: string,
    repositoryId: string,
    opts?: { baseline?: boolean }
  ): Promise<PipelineResult> {
    const baseline = opts?.baseline === true;
    const intelligence = await this.activityService.runIntelligenceForRepository(userId, repositoryId);

    // Only genuinely new work feeds memory and the opportunity queue.
    const { written } = await this.memoryService.updateMemoryFromActivities(
      userId,
      repositoryId,
      intelligence.newActivityIds
    );

    // The user can switch opportunity detection off entirely. Memory still
    // records the work; only the content queue is withheld. resolveSettings
    // degrades to defaults (detection ON) on a read failure, so a transient DB
    // error never silently stops detection.
    const settings = await resolveSettings(this.settingsRepository, userId);
    if (settings.detectOpportunities === false) {
      return { ...intelligence, memoryWritten: written, newOpportunities: 0, baseline };
    }

    const { created } = await this.opportunityService.detectAndStore(userId, repositoryId, {
      baseline,
      activityIds: intelligence.newActivityIds
    });

    return {
      ...intelligence,
      memoryWritten: written,
      newOpportunities: created,
      baseline
    };
  }
}

export default PipelineService;
