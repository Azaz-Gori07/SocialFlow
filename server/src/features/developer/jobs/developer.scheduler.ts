import { env } from '../../../shared/config/env.config';
import { logger } from '../../../shared/utils/logger';
import DeveloperRepositoryModel, { IDeveloperRepository } from '../repositories/repository.model';
import { syncAndProcess } from './syncOrchestrator';

type Query = Record<string, unknown>;

/** First tick is delayed so boot-time work (DB connect, migrations) settles first. */
const INITIAL_DELAY_MS = 60 * 1000;
const POLL_INTERVAL_MS = 5 * 60 * 1000;
/** A repository idle for longer than this is due for a refresh sync. */
const STALE_MS = 15 * 60 * 1000;
/** A claim older than this is assumed to belong to a crashed run and is reclaimed. */
const STALE_CLAIM_MS = 10 * 60 * 1000;
/** Repositories synced per tick. Keeps one tick well under the interval. */
const MAX_REPOS_PER_TICK = 10;

let timer: NodeJS.Timeout | null = null;
let initialTimer: NodeJS.Timeout | null = null;
/** Single in-process lock: ticks never overlap themselves. */
let running = false;

/**
 * Claim the repository for this process. Two steps: the strict claim refuses
 * anything already `syncing`; the fallback reclaims only claims that have been
 * stuck past STALE_CLAIM_MS, which is what a crashed run leaves behind.
 */
async function claimRepository(repositoryId: string, staleClaimCutoff: Date): Promise<IDeveloperRepository | null> {
  const claimed = await DeveloperRepositoryModel.findOneAndUpdate(
    { _id: repositoryId, lastSyncedAt: { $ne: null }, syncStatus: { $ne: 'syncing' } } as Query,
    { $set: { syncStatus: 'syncing' } },
    { returnDocument: 'after' }
  ).exec();
  if (claimed) return claimed;

  return DeveloperRepositoryModel.findOneAndUpdate(
    { _id: repositoryId, lastSyncedAt: { $ne: null }, updatedAt: { $lt: staleClaimCutoff }, syncStatus: { $ne: 'syncing' } } as Query,
    { $set: { syncStatus: 'syncing' } },
    { returnDocument: 'after' }
  ).exec();
}

/**
 * One pass. Never throws: every stage is isolated so a single bad repository
 * cannot stop the rest of the batch, and a thrown error cannot escape the
 * interval and take the process down.
 */
export async function runDeveloperSchedulerTick(): Promise<void> {
  try {
    // Defence in depth: the bootstrap only starts this when the flag is on.
    if (!env.developerFlowEnabled) return;
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const staleCutoff = new Date(now - STALE_MS);
      const staleClaimCutoff = new Date(now - STALE_CLAIM_MS);

      // Never-synced repositories are excluded on purpose (`lastSyncedAt != null`):
      // the first sync is a user action, because it also establishes the baseline.
      const candidates = await DeveloperRepositoryModel.find({
        lastSyncedAt: { $ne: null, $lt: staleCutoff },
        aiMonitoring: true,
        syncStatus: { $ne: 'syncing' }
      } as Query)
        .sort({ lastSyncedAt: 1 })
        .limit(MAX_REPOS_PER_TICK)
        .exec();

      for (const candidate of candidates) {
        const repositoryId = candidate._id.toString();
        const claimed = await claimRepository(repositoryId, staleClaimCutoff);
        if (!claimed) continue; // Another instance or tick got there first.

        try {
          // syncStatus is settled by the sync service itself ('synced' on
          // completion, 'error' via markFailed), so nothing to release here.
          const result = await syncAndProcess(claimed.userId, repositoryId, 'repo_sync', 'scheduled');
          logger.info('[developer] scheduled sync completed', {
            repositoryId,
            counts: result.counts,
            errors: result.errors
          });
        } catch (error) {
          logger.error('[developer] scheduled sync failed', {
            repositoryId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } finally {
      running = false;
    }
  } catch (error) {
    logger.error('[developer] scheduler tick failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function startDeveloperScheduler(): void {
  try {
    if (timer || initialTimer) return;
    initialTimer = setTimeout(() => {
      initialTimer = null;
      runDeveloperSchedulerTick();
      timer = setInterval(() => {
        runDeveloperSchedulerTick();
      }, POLL_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
    logger.info('Developer background scheduler started');
  } catch (error) {
    // Called from server bootstrap: a failure here must never stop the server.
    logger.error('[developer] failed to start scheduler', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function stopDeveloperScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
}
