"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const post_scheduler_1 = require("../post.scheduler");
const queue_manager_1 = require("../queue.manager");
jest.mock('../queue.manager');
describe('PostScheduler Unit Tests', () => {
    const mockPostId = 'pst_999';
    const mockScheduledAt = new Date(Date.now() + 60000).toISOString();
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('should schedule post via BullMQ if Redis is active', async () => {
        queue_manager_1.QueueManager.isRedisActive.mockReturnValue(true);
        queue_manager_1.QueueManager.schedulePublishing.mockResolvedValue('job_id_123');
        const result = await post_scheduler_1.PostScheduler.schedule(mockPostId, mockScheduledAt);
        expect(queue_manager_1.QueueManager.schedulePublishing).toHaveBeenCalledWith(mockPostId, expect.any(Number));
        expect(result).toBe(true);
    });
    it('should fall back gracefully and return false if Redis is offline', async () => {
        queue_manager_1.QueueManager.isRedisActive.mockReturnValue(false);
        const result = await post_scheduler_1.PostScheduler.schedule(mockPostId, mockScheduledAt);
        expect(queue_manager_1.QueueManager.schedulePublishing).not.toHaveBeenCalled();
        expect(result).toBe(false);
    });
    it('should cancel publishing job via QueueManager if Redis is active', async () => {
        queue_manager_1.QueueManager.isRedisActive.mockReturnValue(true);
        queue_manager_1.QueueManager.cancelPublishing.mockResolvedValue(true);
        const result = await post_scheduler_1.PostScheduler.cancel(mockPostId);
        expect(queue_manager_1.QueueManager.cancelPublishing).toHaveBeenCalledWith(mockPostId);
        expect(result).toBe(true);
    });
    it('should not trigger QueueManager cancel if Redis is offline', async () => {
        queue_manager_1.QueueManager.isRedisActive.mockReturnValue(false);
        const result = await post_scheduler_1.PostScheduler.cancel(mockPostId);
        expect(queue_manager_1.QueueManager.cancelPublishing).not.toHaveBeenCalled();
        expect(result).toBe(false);
    });
});
