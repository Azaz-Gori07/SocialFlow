import { QueueManager } from './queue.manager';

export class PostScheduler {
  /**
   * Schedules a post for publishing
   * Calculates the delay and registers a BullMQ delayed job, or logs fallback warning
   * @returns true if queued via BullMQ, false if running in fallback mode
   */
  static async schedule(postId: string, scheduledAtStr: string): Promise<boolean> {
    const scheduledAt = new Date(scheduledAtStr);
    const delay = scheduledAt.getTime() - Date.now();

    // Verify if Redis is active to queue via BullMQ
    if (QueueManager.isRedisActive()) {
      const jobId = await QueueManager.schedulePublishing(postId, delay);
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
  static async cancel(postId: string): Promise<boolean> {
    if (QueueManager.isRedisActive()) {
      return QueueManager.cancelPublishing(postId);
    }
    return false;
  }
}
export default PostScheduler;
