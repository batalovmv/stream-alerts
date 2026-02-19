/**
 * BullMQ queue for announcement delivery.
 *
 * Stream events are enqueued immediately from the webhook handler.
 * Workers process them asynchronously with retry logic.
 */

import { Queue, Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { processStreamEvent, type StreamEventPayload } from '../services/announcementService.js';

const QUEUE_NAME = 'announcements';

// Parse Redis URL properly to extract host/port/password/tls for BullMQ
function parseRedisConnection() {
  try {
    const redisUrl = new URL(config.redisUrl);
    return {
      host: redisUrl.hostname || 'localhost',
      port: parseInt(redisUrl.port || '6379', 10),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      maxRetriesPerRequest: null,
      ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
    };
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'queue.invalid_redis_url');
    throw new Error('Invalid REDIS_URL format');
  }
}

const connection = parseRedisConnection();

export const announcementQueue = new Queue<StreamEventPayload>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/** Enqueue a stream event for async processing */
export async function enqueueStreamEvent(payload: StreamEventPayload): Promise<void> {
  const jobId = `${payload.event}:${payload.channelId}:${payload.startedAt ?? 'no-start'}`;

  await announcementQueue.add(payload.event, payload, {
    jobId,
    priority: payload.event === 'stream.online' ? 1 : 2,
  });

  logger.info({ jobId, event: payload.event, channelId: payload.channelId }, 'queue.enqueued');
}

/** Close the queue's Redis connection for graceful shutdown */
export async function closeQueue(): Promise<void> {
  await announcementQueue.close();
}

/** Start the announcement worker. Returns the Worker instance for graceful shutdown. */
export function startAnnouncementWorker(): Worker<StreamEventPayload> {
  const worker = new Worker<StreamEventPayload>(
    QUEUE_NAME,
    async (job) => {
      logger.info(
        { jobId: job.id, event: job.data.event, attempt: job.attemptsMade + 1 },
        'queue.processing',
      );
      await processStreamEvent(job.data);
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 30,
        duration: 1000,
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'queue.completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message, attempts: job?.attemptsMade },
      'queue.failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'queue.worker_error');
  });

  logger.info('queue.worker_started');
  return worker;
}
