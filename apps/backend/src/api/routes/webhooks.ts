import { Router, type Router as RouterType } from 'express';
import { webhookAuth } from '../middleware/webhookAuth.js';
import { type StreamEventPayload } from '../../services/announcementService.js';
import { announcementQueue } from '../../queues/announcementQueue.js';
import { logger } from '../../lib/logger.js';

const router: RouterType = Router();

/**
 * POST /api/webhooks/stream
 *
 * Receives stream events from MemeLab backend.
 * Validates payload and enqueues for async processing via BullMQ.
 */
router.post('/stream', webhookAuth, async (req, res) => {
  const payload = req.body as StreamEventPayload;

  if (!payload.event || !payload.channelId) {
    res.status(400).json({ error: 'Missing required fields: event, channelId' });
    return;
  }

  if (payload.event !== 'stream.online' && payload.event !== 'stream.offline') {
    res.status(400).json({ error: 'Unknown event type' });
    return;
  }

  logger.info({ event: payload.event, channelSlug: payload.channelSlug }, 'webhook.stream_event');

  await announcementQueue.add(payload.event, payload, {
    jobId: `${payload.channelId}:${payload.event}:${Date.now()}`,
  });

  res.status(200).json({ ok: true });
});

export { router as webhooksRouter };
