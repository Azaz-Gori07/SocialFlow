"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerService = void 0;
const db_1 = require("../database/db");
const queue_manager_1 = require("./queue/queue.manager");
const provider_factory_1 = require("./social/providers/provider.factory");
const encryption_adapter_1 = require("./social/adapters/encryption.adapter");
// Helpers for state transition validation
const VALID_TRANSITIONS = {
    draft: ['scheduled', 'published', 'failed'],
    scheduled: ['published', 'failed', 'draft'], // draft if user unschedules
    published: [],
    failed: ['scheduled', 'draft']
};
/**
 * Returns true if the transition from `from` to `to` is allowed.
 * Prevents invalid state transitions like published → scheduled.
 */
function isValidTransition(from, to) {
    if (from === to)
        return false;
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
exports.SchedulerService = {
    start: () => {
        console.log('⚡ Background Scheduler Service started successfully.');
        // 1. Post Publisher Loop - Runs every 60 seconds (1 minute)
        setInterval(async () => {
            try {
                // P1.5: Skip processing if BullMQ is active to prevent dual-publish
                if (queue_manager_1.QueueManager.isRedisActive()) {
                    return; // BullMQ worker handles publishing
                }
                const now = new Date();
                const pendingPosts = await db_1.db.posts.find({
                    status: 'scheduled',
                    scheduledAt: { $lte: now.toISOString() }
                });
                if (pendingPosts.length > 0) {
                    console.log(`[Scheduler] Found ${pendingPosts.length} posts due for publishing.`);
                    for (const post of pendingPosts) {
                        // P1.4: Re-fetch the post to verify state has not changed
                        // (preventing race condition with BullMQ if Redis came online mid-loop)
                        const current = await db_1.db.posts.findOne({ _id: post._id });
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
                            const platformOutputs = {};
                            for (const platform of post.platforms) {
                                // Find the user's connected account for this platform
                                const accounts = await db_1.db.socialAccounts.find({
                                    userId: post.userId,
                                    platform: platform
                                });
                                if (accounts.length === 0) {
                                    throw new Error(`No connected ${platform} account found for user ${post.userId}`);
                                }
                                const account = accounts[0];
                                const rawAccessToken = encryption_adapter_1.EncryptionAdapter.decrypt(account.accessToken);
                                const provider = provider_factory_1.ProviderFactory.getProvider(platform);
                                const publishedId = await provider.publishPost(rawAccessToken, post.platformContent?.[platform] || post.content, post.media, account.accountId);
                                platformOutputs[platform] = publishedId;
                            }
                            // All platforms succeeded — mark post as published
                            await db_1.db.posts.updateOne({ _id: post._id, status: 'scheduled' }, {
                                $set: {
                                    status: 'published',
                                    publishedAt: now.toISOString(),
                                    platformContent: { ...post.platformContent, ...platformOutputs }
                                }
                            });
                            // Log activity
                            await db_1.db.activityLogs.create({
                                userId: post.userId,
                                action: 'POST_PUBLISHED_AUTOMATIC',
                                details: `Published scheduled post to [${post.platforms.join(', ')}] via fallback scheduler`
                            });
                            // Send success notification
                            await db_1.db.notifications.create({
                                userId: post.userId,
                                title: 'Scheduled Post Published',
                                message: `Your scheduled post has been published to: ${post.platforms.join(', ')}.`,
                                read: false,
                                type: 'post_published'
                            });
                            console.log(`[Scheduler] Successfully published post ${post._id}`, platformOutputs);
                        }
                        catch (error) {
                            // Publishing failed — mark post as failed
                            console.error(`[Scheduler] Failed to publish post ${post._id}: ${error.message}`);
                            await db_1.db.posts.updateOne({ _id: post._id }, {
                                $set: {
                                    status: 'failed',
                                    failedReason: error.message || 'Fallback scheduler publishing failed'
                                }
                            });
                            // Send failure notification
                            await db_1.db.notifications.create({
                                userId: post.userId,
                                title: 'Scheduled Post Failed',
                                message: `Publishing to ${post.platforms.join(', ')} failed: ${error.message || 'Unknown error'}`,
                                read: false,
                                type: 'post_failed'
                            });
                        }
                    }
                }
            }
            catch (error) {
                console.error('[Scheduler] Error in post publisher job:', error);
            }
        }, 60 * 1000); // 1 minute
    }
};
