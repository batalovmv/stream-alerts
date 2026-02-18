import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
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
import { setupBot, stopPolling } from './bot/setup.js';
import { startAnnouncementWorker } from './workers/announcementQueue.js';

import type { Worker } from 'bullmq';

let announcementWorker: Worker | null = null;
let botReady = false;

const app = express();

// ─── Middleware ────────────────────────────────────────────

app.use(cors({
  origin: config.isDev ? 'http://localhost:5173' : ['https://notify.memelab.ru'],
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));

// ─── Register Providers ───────────────────────────────────

if (config.telegramBotToken) {
  registerProvider(new TelegramProvider());
  logger.info('Telegram provider registered');
}

if (config.maxBotToken) {
  registerProvider(new MaxProvider());
  logger.info('MAX provider registered');
}

// ─── Routes ───────────────────────────────────────────────

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version, bot: botReady });
});

app.use('/api/auth', authRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/chats', chatsRouter);

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
    // Then drain the worker queue
    if (announcementWorker) await announcementWorker.close();
    await prisma.$disconnect();
    redis.disconnect();
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'shutdown.error');
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
