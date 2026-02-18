import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { webhookAuth } from '../middleware/webhookAuth.js';
import { validate } from '../middleware/validation.js';
import { enqueueStreamEvent } from '../../workers/announcementQueue.js';
import { logger } from '../../lib/logger.js';

const streamEventSchema = z.object({
  event: z.enum(['stream.online', 'stream.offline']),
  channelId: z.string().min(1),
  channelSlug: z.string().min(1),
  twitchLogin: z.string().min(1),
  streamTitle: z.string().optional(),
  gameName: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  startedAt: z.string().optional(),
});

const router: RouterType = Router();

/**
 * POST /api/webhooks/stream
 *
 * Receives stream events from MemeLab backend.
 * Enqueues to BullMQ for async processing with retries.
 */
router.post('/stream', webhookAuth, validate(streamEventSchema), async (req, res) => {
  const payload = req.body;

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
