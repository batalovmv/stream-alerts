import { Router, type Router as RouterType } from 'express';
import { webhookAuth } from '../middleware/webhookAuth.js';
import type { StreamEventPayload } from '../../services/announcementService.js';
import { enqueueStreamEvent } from '../../workers/announcementQueue.js';
import { logger } from '../../lib/logger.js';

const router: RouterType = Router();

/**
 * POST /api/webhooks/stream
 *
 * Receives stream events from MemeLab backend.
 * Enqueues to BullMQ for async processing with retries.
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

  try {
    await enqueueStreamEvent(payload);
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'webhook.enqueue_failed');
    res.status(500).json({ error: 'Failed to enqueue event' });
  }
});

export { router as webhooksRouter };
