import { db } from '../database/db';
import { Post } from '../types';
import { PostModel } from '../features/post/post.model';
import DraftModel from '../features/draft/draft.model';
import { DraftPublisher } from '../features/draft/draft.publisher';
import { DraftRepository } from '../features/draft/draft.repository';
import { ProviderFactory } from './social/providers/provider.factory';
import { EncryptionAdapter } from './social/adapters/encryption.adapter';

const POLL_INTERVAL_MS = 15 * 1000;
const STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_DRAFT_RETRIES = 3;
const DRAFT_RETRY_BACKOFF_MS = 60 * 1000;

async function processScheduledPosts(): Promise<void> {
  const now = new Date();
  const pendingPosts = await PostModel.find({
    status: 'scheduled',
    scheduledAt: { $lte: now.toISOString() }
  });

  if (pendingPosts.length === 0) return;
  console.log(`[Scheduler] Found ${pendingPosts.length} posts due for publishing.`);

  for (const post of pendingPosts) {
    const claimed = await PostModel.findOneAndUpdate(
      {
        _id: post._id,
        status: 'scheduled',
        scheduledAt: { $lte: now.toISOString() }
      },
      { $set: { status: 'publishing', lastAttemptAt: now.toISOString() } },
      { returnDocument: 'after' }
    );

    if (!claimed) {
      console.log(`[Scheduler] Post ${post._id} already claimed by another instance. Skipping.`);
      continue;
    }

    try {
      const platformOutputs: Record<string, string> = {};

      for (const platform of post.platforms) {
        const accounts = await db.socialAccounts.find({
          userId: post.userId,
          platform: platform as string
        });

        if (accounts.length === 0) {
          throw new Error(`No connected ${platform} account found for user ${post.userId}`);
        }

        const account = accounts[0];
        const rawAccessToken = EncryptionAdapter.decrypt(account.accessToken);
        const provider = ProviderFactory.getProvider(platform);

        const publishedId = await provider.publishPost(
          rawAccessToken,
          post.platformContent?.[platform] || post.content,
          post.media,
          account.accountId
        );

        platformOutputs[platform] = publishedId;
      }

      await PostModel.updateOne(
        { _id: post._id, status: 'publishing' },
        {
          $set: {
            status: 'published',
            publishedAt: now.toISOString(),
            platformContent: { ...post.platformContent, ...platformOutputs }
          }
        }
      );

      await db.activityLogs.create({
        userId: post.userId,
        action: 'POST_PUBLISHED_AUTOMATIC',
        details: `Published scheduled post to [${post.platforms.join(', ')}] via MongoDB scheduler`
      });

      await db.notifications.create({
        userId: post.userId,
        title: 'Scheduled Post Published',
        message: `Your scheduled post has been published to: ${post.platforms.join(', ')}.`,
        read: false,
        type: 'post_published'
      });

      console.log(`[Scheduler] Successfully published post ${post._id}`, platformOutputs);
    } catch (error: any) {
      console.error(`[Scheduler] Failed to publish post ${post._id}: ${error.message}`);

      await PostModel.updateOne(
        { _id: post._id, status: 'publishing' },
        {
          $set: {
            status: 'failed',
            failedReason: error.message || 'MongoDB scheduler publishing failed',
            lastAttemptAt: now.toISOString()
          }
        }
      );

      await db.notifications.create({
        userId: post.userId,
        title: 'Scheduled Post Failed',
        message: `Publishing to ${post.platforms.join(', ')} failed: ${error.message || 'Unknown error'}`,
        read: false,
        type: 'post_failed'
      });
    }
  }
}

async function processReadyDrafts(): Promise<void> {
  const now = new Date();
  const pendingDrafts = await DraftModel.find({
    status: 'ready',
    $or: [
      { scheduledAt: { $exists: false } },
      { scheduledAt: null },
      { scheduledAt: { $lte: now.toISOString() } }
    ]
  }).sort({ createdAt: 1 }).limit(10).exec();

  if (pendingDrafts.length === 0) return;
  console.log(`[Scheduler] Found ${pendingDrafts.length} draft(s) ready to publish.`);

  const draftRepo = new DraftRepository();
  const draftPublisher = new DraftPublisher(draftRepo);

  for (const draft of pendingDrafts) {
    const claimed = await DraftModel.findOneAndUpdate(
      {
        _id: draft._id,
        status: 'ready',
        $or: [
          { scheduledAt: { $exists: false } },
          { scheduledAt: null },
          { scheduledAt: { $lte: now.toISOString() } }
        ]
      },
      { $set: { status: 'publishing', lastAttemptAt: now.toISOString() } },
      { returnDocument: 'after' }
    );

    if (!claimed) {
      console.log(`[Scheduler] Draft ${draft._id} already claimed. Skipping.`);
      continue;
    }

    try {
      await draftPublisher.publishDraft(claimed);
      console.log(`[Scheduler] Successfully published draft ${draft._id}`);
    } catch (error: any) {
      console.error(`[Scheduler] Failed to publish draft ${draft._id}: ${error.message}`);
    }
  }
}

async function processRetries(): Promise<void> {
  const now = new Date();
  const failedDrafts = await DraftModel.find({
    status: 'failed',
    retryCount: { $lt: MAX_DRAFT_RETRIES }
  }).sort({ lastAttemptAt: 1 }).limit(10).exec();

  if (failedDrafts.length === 0) return;

  const draftRepo = new DraftRepository();
  const draftPublisher = new DraftPublisher(draftRepo);

  for (const draft of failedDrafts) {
    if (!draft.lastAttemptAt) continue;
    const elapsed = now.getTime() - new Date(draft.lastAttemptAt).getTime();
    const backoffMs = Math.min((draft.retryCount + 1) * DRAFT_RETRY_BACKOFF_MS, 180 * 1000);
    if (elapsed < backoffMs) continue;

    console.log(`[Scheduler] Auto-retrying draft ${draft._id} (retry #${draft.retryCount})...`);
    try {
      await draftPublisher.retryDraft(draft._id.toString(), draft.userId);
    } catch (error: any) {
      console.error(`[Scheduler] Retry error for draft ${draft._id}: ${error.message}`);
    }
  }
}

async function cleanupStaleLocks(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_LOCK_TIMEOUT_MS).toISOString();

  const postsUnlocked = await PostModel.updateMany(
    {
      status: 'publishing',
      lastAttemptAt: { $lt: cutoff }
    },
    { $set: { status: 'scheduled' } }
  );

  if (postsUnlocked.modifiedCount > 0) {
    console.log(`[Scheduler] Recovered ${postsUnlocked.modifiedCount} stale post lock(s).`);
  }

  const draftsUnlocked = await DraftModel.updateMany(
    {
      status: 'publishing',
      lastAttemptAt: { $lt: cutoff }
    },
    { $set: { status: 'ready' } }
  );

  if (draftsUnlocked.modifiedCount > 0) {
    console.log(`[Scheduler] Recovered ${draftsUnlocked.modifiedCount} stale draft lock(s).`);
  }
}

export const SchedulerService = {
  start: () => {
    console.log('⚡ Background Scheduler Service started successfully.');

    setInterval(async () => {
      try {
        await cleanupStaleLocks();
        await processScheduledPosts();
        await processReadyDrafts();
        await processRetries();
      } catch (error) {
        console.error('[Scheduler] Error in main loop:', error);
      }
    }, POLL_INTERVAL_MS);
  }
};
