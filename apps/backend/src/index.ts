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
import { setupBot } from './bot/setup.js';
import { startAnnouncementWorker } from './workers/announcementQueue.js';

const app = express();

// ─── Middleware ────────────────────────────────────────────

app.use(cors({
  origin: config.isDev ? 'http://localhost:5173' : ['https://notify.memelab.ru'],
  credentials: true,
}));
app.use(express.json());

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
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
  startAnnouncementWorker();

  // Initialize Telegram bot (polling or webhook)
  setupBot(app).catch((err) => {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'bot.init_failed');
  });
});

// ─── Graceful Shutdown ────────────────────────────────────

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down...');
  server.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
