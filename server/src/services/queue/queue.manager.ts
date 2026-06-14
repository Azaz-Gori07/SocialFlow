/**
 * @deprecated Scheduling is now handled by MongoDB-based SchedulerService.
 * This module is a no-op stub kept for backward compatibility.
 * BullMQ/Redis are no longer required.
 */

export const QueueManager = {
  getQueue: (): null => null,
  getConnection: (): null => null,
  isRedisActive: (): boolean => false,
  onConnect: (_callback: () => void): void => {},
  schedulePublishing: async (_postId: string, _delayMs: number): Promise<null> => null,
  cancelPublishing: async (_postId: string): Promise<boolean> => false,
};
export default QueueManager;
