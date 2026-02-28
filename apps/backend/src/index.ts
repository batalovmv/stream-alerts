import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { registerProvider } from './providers/registry.js';
import { TelegramProvider } from './providers/telegram/TelegramProvider.js';
import { MaxProvider } from './providers/max/MaxProvider.js';
import { webhooksRouter } from './api/routes/webhooks.js';
import { chatsRouter } from './api/routes/chats.js';
import { authRouter } from './api/routes/auth.js';
import { streamerRouter } from './api/routes/streamer.js';
import { setupBot, stopPolling } from './bot/setup.js';
import { startAnnouncementWorker, closeQueue } from './workers/announcementQueue.js';

import type { Worker } from 'bullmq';

let announcementWorker: Worker | null = null;
let botReady = false;

const app = express();
app.set('trust proxy', 1);

// ─── Security Headers ────────────────────────────────────
app.use(helmet());

// ─── Middleware ────────────────────────────────────────────

const allowedOrigins = config.isDev ? ['http://localhost:5173'] : ['https://notify.memelab.ru'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));

// ─── CSRF Protection ─────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  if (req.path.startsWith('/api/webhooks')) return next();

  const origin = req.headers.origin || (() => {
    try { return req.headers.referer ? new URL(req.headers.referer).origin : null; } catch { return null; }
  })();

  if (!origin) {
    if (!config.isDev) {
      return res.status(403).json({ error: 'CSRF: missing Origin header' });
    }
    return next();
  }

  if (!allowedOrigins.includes(origin)) {
    logger.warn({ origin, path: req.path }, 'csrf_blocked');
    return res.status(403).json({ error: 'CSRF: origin not allowed' });
  }

  next();
});

// ─── Rate Limiting (Redis-backed, works across multiple processes) ───

function rateLimit(name: string, windowMs: number, max: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const windowKey = `rl:${name}:${ip}:${Math.floor(Date.now() / windowMs)}`;
    try {
      const count = await redis.incr(windowKey);
      if (count === 1) await redis.pexpire(windowKey, windowMs);
      if (count > max) {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
      next();
    } catch {
      next(); // fail-open: allow request if Redis is unavailable
    }
  };
}

app.use('/api/', rateLimit('api', 60_000, 120));
app.use('/api/auth/', rateLimit('auth', 60_000, 20));

// ─── Register Providers ───────────────────────────────────

if (config.telegramBotToken) {
  registerProvider(new TelegramProvider());
  logger.info('Telegram provider registered');
}

// MAX provider — DISABLED until bot creation on dev.max.ru becomes available.
// Code is complete; just set MAX_BOT_TOKEN to activate.
if (config.maxBotToken) {
  registerProvider(new MaxProvider());
  logger.info('MAX provider registered');
}

// ─── Routes ───────────────────────────────────────────────

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

app.get('/api/health', async (_req, res) => {
  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);
    res.json({ status: 'ok', version, bot: botReady });
  } catch {
    res.status(503).json({ status: 'degraded', version, bot: botReady });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/streamer', streamerRouter);

// ─── Global Error Handler ─────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'unhandled_error');
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'MemeLab Notify started');

  // Start BullMQ announcement worker
  announcementWorker = startAnnouncementWorker();

  // Initialize Telegram bot (polling or webhook)
  setupBot(app)
    .then(() => { botReady = true; })
    .catch((err) => {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'bot.init_failed');
    });
});

// ─── Graceful Shutdown ────────────────────────────────────

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down...');

  // Hard deadline: force exit after 15 seconds to prevent hanging
  const forceTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 15_000);
  forceTimer.unref();

  try {
    stopPolling();
    // Close HTTP server first to stop accepting new requests
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    // Then drain the worker queue and close queue connection
    if (announcementWorker) await announcementWorker.close();
    await closeQueue();
    await prisma.$disconnect();
    redis.disconnect();
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'shutdown.error');
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
