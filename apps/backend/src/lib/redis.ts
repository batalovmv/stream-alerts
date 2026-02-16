import Redis from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'redis.error');
});

redis.on('connect', () => {
  logger.info('redis.connected');
});
