import { contentService, pipelineService, syncService } from '../developer.routes';
import { PipelineResult } from '../intelligence/pipeline.service';
import { AutoGenerationResult } from '../content/content.service';
import { SyncRunResult, DeveloperSyncSource } from '../developer.types';
import { logger } from '../../../shared/utils/logger';

export interface SyncProcessResult {
  isInitialSync: boolean;
  counts: SyncRunResult;
  /** Null when the intelligence stage failed; the sync itself is already persisted. */
  pipeline: PipelineResult | null;
  generation: AutoGenerationResult | null;
  /** Per-stage failure messages from stages 2 and 3. Stage 1 throws instead. */
  errors: string[];
}

const EMPTY_GENERATION: AutoGenerationResult = { generated: 0, skipped: 0, pending: 0, created: [] };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The one definition of "sync a repository and everything downstream of it".
 * Manual sync, GitHub webhooks and the scheduler all funnel through here so the
 * chain can never drift between entry points.
 *
 * Error isolation is deliberate and asymmetric:
 *  - Stage 1 (sync) throws. Nothing was imported, so the caller must see it.
 *  - Stages 2 and 3 are swallowed, logged, and reported in `errors`. The sync
 *    data is already committed at that point, and both stages are idempotent
 *    (evidence keys / opportunity source ids / memory keys), so the next trigger
 *    re-processes anything that was missed. This is what lets a webhook answer
 *    202 as soon as the sync succeeded, and lets a scheduler tick carry on to
 *    the next repository.
 */
export async function syncAndProcess(
  userId: string,
  repositoryId: string,
  eventType: string,
  source: DeveloperSyncSource
): Promise<SyncProcessResult> {
  const sync = await syncService.runSyncForEvent(userId, repositoryId, eventType, source);
  const errors: string[] = [];

  let pipeline: PipelineResult | null = null;
  try {
    pipeline = await pipelineService.runPipelineForRepository(userId, repositoryId, {
      baseline: sync.isInitialSync
    });
  } catch (error) {
    errors.push(`pipeline: ${message(error)}`);
    logger.error('[developer] pipeline stage failed', { userId, repositoryId, error: message(error) });
  }

  let generation: AutoGenerationResult | null = null;
  try {
    generation = await contentService.runAutoGeneration(userId);
  } catch (error) {
    // runAutoGeneration already swallows its own failures; this is a backstop so
    // an unexpected throw can never cost us the pipeline result above.
    errors.push(`generation: ${message(error)}`);
    logger.error('[developer] auto-generation stage failed', { userId, repositoryId, error: message(error) });
    generation = EMPTY_GENERATION;
  }

  return { isInitialSync: sync.isInitialSync, counts: sync.counts, pipeline, generation, errors };
}

export default syncAndProcess;
