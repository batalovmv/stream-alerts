import { Queue } from 'bullmq';
import { config } from '../lib/config.js';
import type { StreamEventPayload } from '../services/announcementService.js';

export const ANNOUNCEMENT_QUEUE = 'announcements';

export const announcementQueue = new Queue<StreamEventPayload>(ANNOUNCEMENT_QUEUE, {
  connection: { url: config.redisUrl },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});
