import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { registerProvider } from './providers/registry.js';
import { TelegramProvider } from './providers/telegram/TelegramProvider.js';
import { webhooksRouter } from './api/routes/webhooks.js';
import { chatsRouter } from './api/routes/chats.js';

const app = express();

// ─── Middleware ────────────────────────────────────────────

app.use(cors({
  origin: config.isDev ? '*' : ['https://notify.memelab.ru'],
  credentials: true,
}));
app.use(express.json());

// ─── Register Providers ───────────────────────────────────

if (config.telegramBotToken) {
  registerProvider(new TelegramProvider());
  logger.info('Telegram provider registered');
}

// TODO: Register MAX provider when ready (Phase 3)

// ─── Routes ───────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.use('/api/webhooks', webhooksRouter);
app.use('/api/chats', chatsRouter);

// TODO: /api/auth routes (OAuth with MemeLab)
// TODO: /api/settings routes

// ─── Start ────────────────────────────────────────────────

app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'MemeLab Notify started');
});
