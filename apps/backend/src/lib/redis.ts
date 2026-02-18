import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  // lazyConnect: false (default) — connect immediately so errors surface at startup
});

redis.on('error', (err: Error) => {
  // Sanitize error messages to prevent Redis password leaking into logs
  const safeMessage = err.message?.replace(/\/\/:[^@]+@/g, '//:***@') ?? 'unknown error';
  logger.error({ err: safeMessage }, 'redis.error');
});

redis.on('connect', () => {
  logger.info('redis.connected');
});
