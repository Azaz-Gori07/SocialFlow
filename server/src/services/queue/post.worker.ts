import { Worker, Job } from 'bullmq';
import { QueueManager } from './queue.manager';
import { ProviderFactory } from '../social/providers/provider.factory';
import { EncryptionAdapter } from '../social/adapters/encryption.adapter';
import mongoose from 'mongoose';

// Register worker to start only after successful Redis connection
QueueManager.onConnect(() => {
  const connection = QueueManager.getConnection();
  if (!connection) {
    return;
  }

  const worker = new Worker(
    'post-publishing',
    async (job: Job) => {
      const { postId } = job.data;
      console.log(`👷 [PostWorker] Processing publishing job for post ${postId} (attempt ${job.attemptsMade + 1})...`);

      const PostModel = mongoose.models.Post || mongoose.model('Post');
      const post = await PostModel.findById(postId);
      if (!post) {
        console.warn(`👷 [PostWorker] Post ${postId} not found in database. Skipping.`);
        return;
      }

      if (post.status !== 'scheduled') {
        console.warn(`👷 [PostWorker] Post ${postId} status is "${post.status}", not "scheduled". Skipping.`);
        return;
      }

      // P1.6: Validate state transition (defensive)
      const VALID_TRANSITIONS: Record<string, string[]> = {
        draft: ['scheduled', 'published', 'failed'],
        scheduled: ['published', 'failed', 'draft'],
        published: [],
        failed: ['scheduled', 'draft']
      };
      if (!VALID_TRANSITIONS[post.status]?.includes('published')) {
        console.warn(`👷 [PostWorker] Invalid state transition ${post.status}→published for post ${postId}. Skipping.`);
        return;
      }

      try {
        const SocialAccountModel = mongoose.models.SocialAccount || mongoose.model('SocialAccount');
        const ActivityLogModel = mongoose.models.ActivityLog || mongoose.model('ActivityLog');
        const NotificationModel = mongoose.models.Notification || mongoose.model('Notification');

        const platformOutputs: Record<string, string> = {};

        for (const platform of post.platforms) {
          const account = await SocialAccountModel.findOne({ userId: post.userId, platform });
          if (!account) {
            throw new Error(`No connected ${platform} account found for user ${post.userId}`);
          }

          const rawAccessToken = EncryptionAdapter.decrypt(account.accessToken);
          const provider = ProviderFactory.getProvider(platform);

          // Publish content to platform (pass accountId for providers like LinkedIn that need author URN)
          const publishedId = await provider.publishPost(
            rawAccessToken,
            post.platformContent?.[platform] || post.content,
            post.media,
            account.accountId
          );

          platformOutputs[platform] = publishedId;
        }

        // 1. Update Post document
        post.status = 'published';
        post.publishedAt = new Date().toISOString();
        post.platformContent = {
          ...post.platformContent,
          ...platformOutputs
        };
        await post.save();

        // 2. Log publishing activity
        const log = new ActivityLogModel({
          userId: post.userId,
          action: 'POST_PUBLISHED_QUEUE',
          details: `Successfully published scheduled post to [${post.platforms.join(', ')}] via BullMQ.`
        });
        await log.save();

        // 3. Create success notification
        const notification = new NotificationModel({
          userId: post.userId,
          title: 'Scheduled Post Published',
          message: `Your post has been successfully published to: ${post.platforms.join(', ')}.`,
          read: false,
          type: 'post_published'
        });
        await notification.save();

        console.log(`✅ [PostWorker] Post ${postId} successfully published to all channels.`);
      } catch (error: any) {
        console.error(`❌ [PostWorker] Error processing post ${postId}: ${error.message}`);

        // Retry logic audits
        const maxAttempts = job.opts.attempts || 3;
        if (job.attemptsMade + 1 >= maxAttempts) {
          // Mark post as failed
          post.status = 'failed';
          post.failedReason = error.message || 'Unknown publishing error';
          await post.save();

          // Create failure notification
          const NotificationModel = mongoose.models.Notification || mongoose.model('Notification');
          const notification = new NotificationModel({
            userId: post.userId,
            title: 'Scheduled Post Failed',
            message: `Publishing to ${post.platforms.join(', ')} failed: ${post.failedReason}`,
            read: false,
            type: 'post_failed'
          });
          await notification.save();

          console.error(`❌ [PostWorker] Post ${postId} marked as FAILED after ${maxAttempts} attempts.`);
        } else {
          // Re-throw to trigger BullMQ retry
          throw error;
        }
      }
    },
    { connection: connection as any }
  );

  worker.on('failed', (job, err) => {
    console.error(`🚨 [PostWorker] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error(`🚨 [PostWorker] Worker connection/error: ${err.message}`);
  });

  console.log('👷 [PostWorker] Post publishing worker started successfully.');
});
