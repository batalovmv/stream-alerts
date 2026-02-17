import { Worker, type Job } from 'bullmq';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { processStreamEvent, type StreamEventPayload } from '../services/announcementService.js';
import { ANNOUNCEMENT_QUEUE } from '../queues/announcementQueue.js';

let worker: Worker<StreamEventPayload> | null = null;

export function startAnnouncementWorker(): Worker<StreamEventPayload> {
  worker = new Worker<StreamEventPayload>(
    ANNOUNCEMENT_QUEUE,
    async (job: Job<StreamEventPayload>) => {
      logger.info({ jobId: job.id, event: job.data.event, channelSlug: job.data.channelSlug }, 'worker.processing');
      await processStreamEvent(job.data);
    },
    {
      connection: { url: config.redisUrl },
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'worker.completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message, attempt: job?.attemptsMade }, 'worker.failed');
  });

  logger.info('Announcement worker started');
  return worker;
}

export async function stopAnnouncementWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    logger.info('Announcement worker stopped');
  }
}
