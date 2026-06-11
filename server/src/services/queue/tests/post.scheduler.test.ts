import { PostScheduler } from '../post.scheduler';
import { QueueManager } from '../queue.manager';

jest.mock('../queue.manager');

describe('PostScheduler Unit Tests', () => {
  const mockPostId = 'pst_999';
  const mockScheduledAt = new Date(Date.now() + 60000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should schedule post via BullMQ if Redis is active', async () => {
    (QueueManager.isRedisActive as jest.Mock).mockReturnValue(true);
    (QueueManager.schedulePublishing as jest.Mock).mockResolvedValue('job_id_123');

    const result = await PostScheduler.schedule(mockPostId, mockScheduledAt);

    expect(QueueManager.schedulePublishing).toHaveBeenCalledWith(mockPostId, expect.any(Number));
    expect(result).toBe(true);
  });

  it('should fall back gracefully and return false if Redis is offline', async () => {
    (QueueManager.isRedisActive as jest.Mock).mockReturnValue(false);

    const result = await PostScheduler.schedule(mockPostId, mockScheduledAt);

    expect(QueueManager.schedulePublishing).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('should cancel publishing job via QueueManager if Redis is active', async () => {
    (QueueManager.isRedisActive as jest.Mock).mockReturnValue(true);
    (QueueManager.cancelPublishing as jest.Mock).mockResolvedValue(true);

    const result = await PostScheduler.cancel(mockPostId);

    expect(QueueManager.cancelPublishing).toHaveBeenCalledWith(mockPostId);
    expect(result).toBe(true);
  });

  it('should not trigger QueueManager cancel if Redis is offline', async () => {
    (QueueManager.isRedisActive as jest.Mock).mockReturnValue(false);

    const result = await PostScheduler.cancel(mockPostId);

    expect(QueueManager.cancelPublishing).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
