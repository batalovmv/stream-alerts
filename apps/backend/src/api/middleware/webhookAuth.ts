import { timingSafeEqual, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

/**
 * Middleware to verify webhook requests from MemeLab backend.
 * Compares SHA-256 digests of secrets to prevent both timing and length-leak attacks.
 */
export function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-webhook-secret'];

  if (!config.webhookSecret) {
    logger.warn('webhook.no_secret_configured');
    res.status(503).json({ error: 'Webhook secret not configured' });
    return;
  }

  // Compare SHA-256 digests (always 32 bytes) to prevent length information leakage
  const incomingHash = createHash('sha256').update(typeof secret === 'string' ? secret : '').digest();
  const expectedHash = createHash('sha256').update(config.webhookSecret).digest();

  if (!timingSafeEqual(incomingHash, expectedHash)) {
    logger.warn({ ip: req.ip }, 'webhook.invalid_secret');
    res.status(403).json({ error: 'Invalid webhook secret' });
    return;
  }

  next();
}
