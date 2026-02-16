import { Router, type Router as RouterType } from 'express';
import { webhookAuth } from '../middleware/webhookAuth.js';
import { processStreamEvent, type StreamEventPayload } from '../../services/announcementService.js';
import { logger } from '../../lib/logger.js';

const router: RouterType = Router();

/**
 * POST /api/webhooks/stream
 *
 * Receives stream events from MemeLab backend.
 * Responds immediately (200), processes async.
 */
router.post('/stream', webhookAuth, (req, res) => {
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

  // Respond immediately — process in background
  res.status(200).json({ ok: true });

  // Fire and forget
  processStreamEvent(payload).catch((error) => {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'webhook.process_failed');
  });
});

export { router as webhooksRouter };
