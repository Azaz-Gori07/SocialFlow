import { db } from '../database/db';
import { Post, SocialPlatform } from '../types';
import { QueueManager } from './queue/queue.manager';
import { ProviderFactory } from './social/providers/provider.factory';
import { EncryptionAdapter } from './social/adapters/encryption.adapter';

// Helpers for state transition validation
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['scheduled', 'published', 'failed'],
  scheduled: ['published', 'failed', 'draft'], // draft if user unschedules
  published: [],
  failed: ['scheduled', 'draft']
};

/**
 * Returns true if the transition from `from` to `to` is allowed.
 * Prevents invalid state transitions like published → scheduled.
 */
function isValidTransition(from: string, to: string): boolean {
  if (from === to) return false;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export const SchedulerService = {
  start: () => {
    console.log('⚡ Background Scheduler Service started successfully.');

    // 1. Post Publisher Loop - Runs every 60 seconds (1 minute)
    setInterval(async () => {
      try {
        // P1.5: Skip processing if BullMQ is active to prevent dual-publish
        if (QueueManager.isRedisActive()) {
          return; // BullMQ worker handles publishing
        }

        const now = new Date();
        const pendingPosts = await db.posts.find({
          status: 'scheduled',
          scheduledAt: { $lte: now.toISOString() }
        });

        if (pendingPosts.length > 0) {
          console.log(`[Scheduler] Found ${pendingPosts.length} posts due for publishing.`);

          for (const post of pendingPosts) {
            // P1.4: Re-fetch the post to verify state has not changed
            // (preventing race condition with BullMQ if Redis came online mid-loop)
            const current = await db.posts.findOne({ _id: post._id });
            if (!current || current.status !== 'scheduled') {
              console.log(`[Scheduler] Skipping post ${post._id} (state changed to: ${current?.status})`);
              continue;
            }

            // P1.6: Validate state transition before publishing
            if (!isValidTransition('scheduled', 'published')) {
              console.warn(`[Scheduler] Invalid transition scheduled→published for post ${post._id}`);
              continue;
            }

            try {
              // Actually publish to each platform via the provider
              const platformOutputs: Record<string, string> = {};

              for (const platform of post.platforms) {
                // Find the user's connected account for this platform
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

              // All platforms succeeded — mark post as published
              await db.posts.updateOne(
                { _id: post._id, status: 'scheduled' },
                {
                  $set: {
                    status: 'published',
                    publishedAt: now.toISOString(),
                    platformContent: { ...post.platformContent, ...platformOutputs }
                  }
                }
              );

              // Log activity
              await db.activityLogs.create({
                userId: post.userId,
                action: 'POST_PUBLISHED_AUTOMATIC',
                details: `Published scheduled post to [${post.platforms.join(', ')}] via fallback scheduler`
              });

              // Send success notification
              await db.notifications.create({
                userId: post.userId,
                title: 'Scheduled Post Published',
                message: `Your scheduled post has been published to: ${post.platforms.join(', ')}.`,
                read: false,
                type: 'post_published'
              });

              console.log(`[Scheduler] Successfully published post ${post._id}`, platformOutputs);
            } catch (error: any) {
              // Publishing failed — mark post as failed
              console.error(`[Scheduler] Failed to publish post ${post._id}: ${error.message}`);

              await db.posts.updateOne(
                { _id: post._id },
                {
                  $set: {
                    status: 'failed',
                    failedReason: error.message || 'Fallback scheduler publishing failed'
                  }
                }
              );

              // Send failure notification
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
      } catch (error) {
        console.error('[Scheduler] Error in post publisher job:', error);
      }
    }, 60 * 1000); // 1 minute

    // 2. Incoming Comment Simulation Loop - Runs every 3 minutes (simulates active inbox)
    setInterval(async () => {
      try {
        // Find all connected social accounts
        const accounts = await db.socialAccounts.find({});
        if (accounts.length === 0) return;

        // Randomly pick one account to receive a comment
        const randomAccount = accounts[Math.floor(Math.random() * accounts.length)];
        
        const commenterNames = ['David Miller', 'Sophia Lee', 'Liam Carter', 'Emma Watson', 'James Smith', 'Zoe Chen'];
        const commentsByPlatform: Record<SocialPlatform, string[]> = {
          twitter: [
            'Agreed! What tools are you using for this?',
            'This thread is gold, bookmarked!',
            'Is this feature available for mobile users?'
          ],
          instagram: [
            'Wow, looks so sleek!',
            'Love this energy! Keep pushing.',
            'DM pricing details please.'
          ],
          facebook: [
            'Awesome workspace layout.',
            'How does this scale for remote marketing teams?',
            'Very helpful dashboard metrics.'
          ],
          linkedin: [
            'Excellent perspective. Shared this with my team.',
            'Thanks for sharing. I see a huge demand for this integration.',
            'How long did this take to build?'
          ],
          youtube: [
            'The tutorial was very clear! Subscribed.',
            'What database did you use here? NeDB?',
            'Can we export these dashboard charts as PDF?'
          ],
          tiktok: [
            'I need this tool in my life rn 😂',
            'Saving this, super helpful.',
            'Do you offer student discounts?'
          ]
        };

        const commentsPool = commentsByPlatform[randomAccount.platform as SocialPlatform] || ['Nice post!'];
        const chosenMessage = commentsPool[Math.floor(Math.random() * commentsPool.length)];
        const commenterName = commenterNames[Math.floor(Math.random() * commenterNames.length)];
        const username = commenterName.toLowerCase().replace(' ', '_');

        const newComment = await db.comments.create({
          platform: randomAccount.platform,
          accountId: randomAccount._id,
          postId: 'pst_' + Math.random().toString(36).substring(2, 9),
          postTitle: 'Latest content update',
          author: {
            username,
            displayName: commenterName,
            avatarUrl: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}`
          },
          message: chosenMessage,
          status: 'unresolved'
        });

        // Send a notification to the account owner
        await db.notifications.create({
          userId: randomAccount.userId,
          title: `New Comment on ${randomAccount.platform}`,
          message: `@${username} commented: "${chosenMessage.substring(0, 30)}..."`,
          read: false,
          type: 'new_comment'
        });

        console.log(`[Scheduler] Simulated comment incoming for ${randomAccount.platform} account @${randomAccount.username}`);
      } catch (error) {
        console.error('[Scheduler] Error in comment simulator job:', error);
      }
    }, 3 * 60 * 1000); // 3 minutes

    // 3. Analytics Update / Sync Loop - Runs every 5 minutes (updates metrics with slight growth)
    setInterval(async () => {
      try {
        const accounts = await db.socialAccounts.find({});
        if (accounts.length === 0) return;

        const today = new Date().toISOString().split('T')[0];

        for (const account of accounts) {
          // Find if there is an analytics record for today
          const todayRecord = await db.analytics.findOne({
            accountId: account._id,
            date: today
          });

          // Simulate positive growth
          const growthFollowers = Math.floor(Math.random() * 5) + 1; // 1-5 new followers
          const growthReach = Math.floor(Math.random() * 80) + 10;
          const growthImpressions = Math.floor(growthReach * 1.8);
          const growthEngagement = Math.floor(growthReach * 0.07);
          const growthClicks = Math.floor(growthEngagement * 0.12);

          if (todayRecord) {
            await db.analytics.updateOne(
              { _id: todayRecord._id },
              {
                $inc: {
                  followers: growthFollowers,
                  reach: growthReach,
                  impressions: growthImpressions,
                  engagement: growthEngagement,
                  clicks: growthClicks
                }
              }
            );
          } else {
            // Find yesterday's record to carry over base followers
            const records = await db.analytics.find({ accountId: account._id });
            const sorted = records.sort((a, b) => b.date.localeCompare(a.date));
            const baseFollowers = sorted.length > 0 ? sorted[0].followers : 10000;

            await db.analytics.create({
              userId: account.userId,
              accountId: account._id,
              platform: account.platform,
              date: today,
              followers: baseFollowers + growthFollowers,
              reach: growthReach,
              impressions: growthImpressions,
              engagement: growthEngagement,
              watchTime: account.platform === 'youtube' ? Math.floor(growthReach * 0.4) : 0,
              clicks: growthClicks,
              ctr: parseFloat((growthClicks / growthImpressions).toFixed(4))
            });
          }
        }
        console.log('[Scheduler] Synced analytics metrics across channels.');
      } catch (error) {
        console.error('[Scheduler] Error in analytics syncing job:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
};
