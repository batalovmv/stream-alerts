/**
 * BullMQ queue for announcement delivery.
 *
 * Stream events are enqueued immediately from the webhook handler.
 * Workers process them asynchronously with retry logic.
 */

import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { processStreamEvent, type StreamEventPayload } from '../services/announcementService.js';

const QUEUE_NAME = 'announcements';

const connection = {
  host: redis.options.host ?? 'localhost',
  port: redis.options.port ?? 6379,
  password: redis.options.password,
};

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
  const jobId = `${payload.event}:${payload.channelId}:${Date.now()}`;

  await announcementQueue.add(payload.event, payload, {
    jobId,
    priority: payload.event === 'stream.online' ? 1 : 2,
  });

  logger.info({ jobId, event: payload.event, channelId: payload.channelId }, 'queue.enqueued');
}

/** Start the announcement worker */
export function startAnnouncementWorker(): void {
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
}
