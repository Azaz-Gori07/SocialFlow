"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostScheduler = void 0;
const queue_manager_1 = require("./queue.manager");
class PostScheduler {
    /**
     * Schedules a post for publishing
     * Calculates the delay and registers a BullMQ delayed job, or logs fallback warning
     * @returns true if queued via BullMQ, false if running in fallback mode
     */
    static async schedule(postId, scheduledAtStr) {
        const scheduledAt = new Date(scheduledAtStr);
        const delay = scheduledAt.getTime() - Date.now();
        // Verify if Redis is active to queue via BullMQ
        if (queue_manager_1.QueueManager.isRedisActive()) {
            const jobId = await queue_manager_1.QueueManager.schedulePublishing(postId, delay);
            if (jobId) {
                console.log(`⏱️ [PostScheduler] Post ${postId} successfully queued via BullMQ (Delay: ${delay}ms).`);
                return true;
            }
        }
        console.log(`⏱️ [PostScheduler] Redis is offline. Post ${postId} is saved in database and will be processed by the backup interval scanner.`);
        return false;
    }
    /**
     * Cancels a scheduled post job in BullMQ
     */
    static async cancel(postId) {
        if (queue_manager_1.QueueManager.isRedisActive()) {
            return queue_manager_1.QueueManager.cancelPublishing(postId);
        }
        return false;
    }
}
exports.PostScheduler = PostScheduler;
exports.default = PostScheduler;
