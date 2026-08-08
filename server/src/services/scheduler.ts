import { PostRepository } from '../features/post/post.repository';
import { DeliveryEngine } from './social/delivery.engine';
import { SocialRepository } from '../features/social/social.repository';
import { IPost, DeliveryStatus } from '../features/post/post.model';
import { NotificationService } from '../features/notification/notification.service';
import { NotificationType } from '../features/notification/notification.types';
import { db } from '../database/db';
import { logger } from '../shared/utils/logger';

const POLL_INTERVAL_MS = 15 * 1000;
const STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

let postRepository = new PostRepository();
let socialRepository = new SocialRepository();
let deliveryEngine = new DeliveryEngine(socialRepository);
let notificationService = new NotificationService();

/**
 * Guideline §20 — scheduler with atomic claiming, per-delivery locking,
 * retry/backoff, stale-lock recovery and dead-lettering.
 */
export async function processDuePosts(): Promise<void> {
  const nowIso = new Date().toISOString();
  const duePosts = await postRepository.findDuePosts(nowIso);
  if (duePosts.length === 0) return;
  logger.info(`Found ${duePosts.length} post(s) due for publishing.`);

  for (const post of duePosts) {
    await processPost(post, nowIso);
  }
}

/** Claim a post and publish every pending/failed delivery exactly once. */
async function processPost(post: IPost, nowIso: string): Promise<void> {
  const claimed = await postRepository.claimDuePost(post._id.toString(), nowIso);
  if (!claimed) {
    logger.info(`Post ${post._id} already claimed by another instance. Skipping.`);
    return;
  }

  await runPostDeliveries(claimed, ['pending']);
}

export { runPostDeliveries, settlePost };

async function runPostDeliveries(post: IPost, fromStatuses: DeliveryStatus[]): Promise<void> {
  const nowIso = new Date().toISOString();
  const results: boolean[] = [];

  for (const delivery of post.deliveries) {
    if (!fromStatuses.includes(delivery.status)) continue;

    const claimed = await postRepository.claimDelivery(post._id.toString(), delivery.socialAccountId, nowIso);
    if (!claimed) continue;

    const claimedDelivery = claimed.deliveries.find(d => d.socialAccountId === delivery.socialAccountId);
    if (!claimedDelivery) continue;

    try {
      const outcome = await deliveryEngine.publishDelivery(claimed, claimedDelivery);
      results.push(outcome.ok);
    } catch (error: any) {
      logger.error(`Delivery ${delivery.platform}/${delivery.socialAccountId} crashed: ${error.message}`);
      results.push(false);
    }
  }

  await settlePost(post);
}

/** Recompute post status and notify once per terminal transition. */
async function settlePost(post: IPost): Promise<void> {
  const nowIso = new Date().toISOString();
  const fresh = await postRepository.findPostById(post._id.toString());
  if (!fresh) return;

  const previousStatus = fresh.status;
  const derived = postRepository.deriveStatus(fresh.deliveries);
  const wasTerminal = previousStatus === 'published' || previousStatus === 'partial_failure' || previousStatus === 'failed';

  if (wasTerminal) return;

  if (derived === 'publishing') return;

  const settled = await postRepository.settlePost(post._id.toString(), derived, nowIso);
  if (!settled) return;

  // Draft-originated posts are notified by the draft publisher (draft_* types).
  if (fresh.draftId) {
    logger.info(`Post ${post._id} settled as ${derived} (draft-originated, skipping post notification).`);
    return;
  }

  const ok = derived === 'published' || derived === 'partial_failure';
  const failedDeliveries = fresh.deliveries.filter(d => d.status === 'failed');

  await db.activityLogs.create({
    userId: fresh.userId,
    action: ok ? 'POST_PUBLISHED_AUTOMATIC' : 'POST_PUBLISH_FAILED',
    details: ok
      ? `Published scheduled post to [${fresh.platforms.join(', ')}]`
      : `Post failed: ${failedDeliveries.map(d => d.lastError).filter(Boolean).join('; ')}`
  });

  await notificationService.create({
    userId: fresh.userId,
    type: ok ? NotificationType.POST_PUBLISHED : NotificationType.POST_FAILED,
    title: ok ? 'Scheduled Post Published' : 'Scheduled Post Failed',
    message: ok
      ? `Your scheduled post has been published to: ${fresh.platforms.join(', ')}.`
      : `Publishing failed: ${failedDeliveries.map(d => d.lastError).filter(Boolean).join('; ') || 'Unknown error'}`
  });

  logger.info(`Post ${post._id} settled as ${derived}.`);
}

/** Retry failed deliveries whose backoff has elapsed (bounded by maxAttempts). */
export async function processRetries(): Promise<void> {
  const nowIso = new Date().toISOString();
  const retryable = await postRepository.findRetryablePosts(nowIso);
  if (retryable.length === 0) return;

  for (const post of retryable) {
    await runPostDeliveries(post, ['failed']);
  }
}

/** Stale-lock recovery: publishing posts older than the cutoff return to scheduled. */
export async function cleanupStaleLocks(): Promise<void> {
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - STALE_LOCK_TIMEOUT_MS).toISOString();
  const released = await postRepository.releaseStaleClaims(cutoffIso, nowIso);
  if (released > 0) {
    logger.info(`Recovered ${released} stale post lock(s).`);
  }
}

export const SchedulerService = {
  start: () => {
    logger.info('Background Scheduler Service started successfully.');

    setInterval(async () => {
      try {
        await cleanupStaleLocks();
        await processDuePosts();
        await processRetries();
      } catch (error) {
        logger.error(`Error in main loop: ${(error as Error).message}`);
      }
    }, POLL_INTERVAL_MS);
  }
};

export default SchedulerService;
