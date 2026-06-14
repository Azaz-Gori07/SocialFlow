/**
 * @deprecated Scheduling is now handled by MongoDB-based SchedulerService.
 * PostScheduler.schedule/cancel are no-ops kept for backward compatibility.
 */

export class PostScheduler {
  static async schedule(_postId: string, _scheduledAtStr: string): Promise<boolean> {
    return false;
  }

  static async cancel(_postId: string): Promise<boolean> {
    return false;
  }
}
export default PostScheduler;
