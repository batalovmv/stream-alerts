import type { Request, Response, NextFunction } from 'express';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

/**
 * Middleware to verify webhook requests from MemeLab backend.
 * Checks X-Webhook-Secret header against configured secret.
 */
export function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-webhook-secret'];

  if (!config.webhookSecret) {
    logger.warn('webhook.no_secret_configured');
    res.status(503).json({ error: 'Webhook secret not configured' });
    return;
  }

  if (secret !== config.webhookSecret) {
    logger.warn({ ip: req.ip }, 'webhook.invalid_secret');
    res.status(403).json({ error: 'Invalid webhook secret' });
    return;
  }

  next();
}
