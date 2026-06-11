import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../../shared/config/env.config';

const QUEUE_NAME = 'post-publishing';

let redisConnection: Redis | null = null;
let postQueue: Queue | null = null;
let useRedis = false;
let onConnectCallbacks: (() => void)[] = [];

// Safe connection setup
try {
  redisConnection = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // Required by BullMQ
    lazyConnect: true // Let us manually trigger connection to handle errors
  });

  redisConnection.on('error', (err) => {
    // If we've already connected and active, log the warning and fallback
    if (useRedis) {
      console.warn(`⚠️ [QueueManager] Redis connection lost: ${err.message}. Falling back to backup publisher.`);
      useRedis = false;
      if (postQueue) {
        postQueue.close().catch(() => {});
        postQueue = null;
      }
      redisConnection?.disconnect();
    }
  });

  redisConnection.connect()
    .then(() => {
      console.log('✅ [QueueManager] Connected to Redis successfully. BullMQ queue activated.');
      useRedis = true;
      
      // Instantiate queue after connection is successful
      postQueue = new Queue(QUEUE_NAME, { connection: redisConnection as any });
      postQueue.on('error', (err) => {
        if (useRedis) {
          console.error(`❌ [QueueManager] BullMQ Queue error: ${err.message}`);
        }
      });

      // Trigger pending post-connection callbacks
      onConnectCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (e: any) {
          console.error(`❌ [QueueManager] Error in onConnect callback: ${e.message}`);
        }
      });
      onConnectCallbacks = [];
    })
    .catch((err) => {
      console.warn(`⚠️ [QueueManager] Redis connection could not be established: ${err.message}. Falling back to in-memory scheduling.`);
      useRedis = false;
      redisConnection?.disconnect();
    });
} catch (err: any) {
  console.warn(`⚠️ [QueueManager] Redis initialization failed: ${err.message}. Running in fallback mode.`);
  useRedis = false;
}

export const QueueManager = {
  getQueue: (): Queue | null => {
    return useRedis ? postQueue : null;
  },

  getConnection: (): Redis | null => {
    return redisConnection;
  },

  isRedisActive: (): boolean => {
    return useRedis;
  },

  /**
   * Register a callback to execute once connection is established
   */
  onConnect: (callback: () => void): void => {
    if (useRedis) {
      callback();
    } else {
      onConnectCallbacks.push(callback);
    }
  },

  /**
   * Adds a post publishing job to the queue with a delay
   */
  schedulePublishing: async (postId: string, delayMs: number): Promise<string | null> => {
    if (!useRedis || !postQueue) {
      return null;
    }

    try {
      const job = await postQueue.add(
        'publish-post',
        { postId },
        {
          delay: Math.max(0, delayMs),
          jobId: postId, // Unique jobId to easily locate/overwrite/cancel later
          attempts: 3, // Retry mechanism: up to 3 attempts
          backoff: {
            type: 'exponential',
            delay: 1000 // Exponential backoff: retry after 1s, 2s, 4s...
          },
          removeOnComplete: true, // Auto clean complete jobs
          removeOnFail: false // Keep failed jobs in history for inspection
        }
      );
      
      console.log(`📡 [QueueManager] Scheduled BullMQ job for post ${postId} in ${delayMs}ms.`);
      return job.id || null;
    } catch (error: any) {
      console.error(`❌ [QueueManager] Failed to add delayed job to BullMQ queue: ${error.message}`);
      return null;
    }
  },

  /**
   * Removes/cancels a scheduled publishing job
   */
  cancelPublishing: async (postId: string): Promise<boolean> => {
    if (!useRedis || !postQueue) {
      return false;
    }

    try {
      const job = await postQueue.getJob(postId);
      if (job) {
        await job.remove();
        console.log(`📡 [QueueManager] Cancelled BullMQ job for post ${postId}.`);
        return true;
      }
      return false;
    } catch (error: any) {
      console.error(`❌ [QueueManager] Failed to remove job from BullMQ queue: ${error.message}`);
      return false;
    }
  }
};
export default QueueManager;
