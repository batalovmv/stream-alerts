/**
 * Telegram bot setup: polling (dev) or webhook (prod).
 *
 * In development mode, uses long polling to receive updates.
 * In production, registers a webhook endpoint on Express.
 */

import { timingSafeEqual, createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import * as tg from '../providers/telegram/telegramApi.js';
import { TelegramApiError } from '../providers/telegram/telegramApi.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { routeUpdate } from './router.js';

const WEBHOOK_PATH = '/api/telegram/webhook';
const WEBHOOK_SECRET = config.telegramWebhookSecret;

/** Bot username resolved from getMe() at startup */
let botUsername = 'MemelabNotifyBot'; // fallback
export function getBotUsername(): string { return botUsername; }

/** Register bot commands menu in Telegram */
async function registerCommands(): Promise<void> {
  await tg.setMyCommands([
    { command: 'start', description: 'Начать работу / привязать аккаунт' },
    { command: 'connect', description: 'Подключить канал или группу' },
    { command: 'channels', description: 'Мои подключённые каналы' },
    { command: 'settings', description: 'Настройки каналов (шаблон, удаление)' },
    { command: 'test', description: 'Отправить тестовый анонс' },
    { command: 'preview', description: 'Предпросмотр шаблона' },
    { command: 'stats', description: 'Статистика анонсов' },
  ]);
}

/** Polling state — allows graceful cancellation */
let pollingActive = false;

/** Stop polling loop (called on shutdown) */
export function stopPolling(): void {
  pollingActive = false;
}

/** Start long polling (development mode) */
async function startPolling(): Promise<void> {
  await tg.deleteWebhook();
  pollingActive = true;
  logger.info('bot.polling_started');

  let offset: number | undefined;

  async function poll() {
    if (!pollingActive) return;
    try {
      const updates = await tg.getUpdates(offset);
      for (const update of updates) {
        if (!pollingActive) return;
        offset = update.update_id + 1;
        routeUpdate(update).catch((err) => {
          logger.error({ err: err instanceof Error ? err.message : String(err) }, 'bot.update_error');
        });
      }
    } catch (error) {
      // Long-poll timeout is normal — Telegram returns no updates within the hold period
      const isTimeout =
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof TelegramApiError && error.code === 408);
      if (!isTimeout) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'bot.polling_error');
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (pollingActive) setImmediate(poll);
  }

  poll();
}

/** Register webhook endpoint on Express app (production mode) */
async function startWebhook(app: Express): Promise<void> {
  if (!WEBHOOK_SECRET) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET is required in production for webhook mode');
  }

  const webhookUrl = `${config.publicUrl}${WEBHOOK_PATH}`;

  app.post(WEBHOOK_PATH, (req: Request, res: Response) => {
    // Validate secret token header (timing-safe comparison via SHA-256 digests)
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const incomingHash = createHash('sha256').update(typeof secretHeader === 'string' ? secretHeader : '').digest();
    const expectedHash = createHash('sha256').update(WEBHOOK_SECRET).digest();
    if (!timingSafeEqual(incomingHash, expectedHash)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const update = req.body;

    // Basic shape validation before processing
    if (!update || typeof update.update_id !== 'number') {
      res.status(400).json({ error: 'Invalid update' });
      return;
    }

    // Respond immediately, process async
    res.status(200).json({ ok: true });

    routeUpdate(update).catch((err) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'bot.webhook_error');
    });
  });

  await tg.setWebhook(webhookUrl, WEBHOOK_SECRET);
  logger.info({ url: webhookUrl }, 'bot.webhook_registered');
}

/** Initialize the Telegram bot */
export async function setupBot(app: Express): Promise<void> {
  if (!config.telegramBotToken) {
    logger.warn('bot.no_token — Telegram bot will not start');
    return;
  }

  const me = await tg.getMe();
  if (me.username) botUsername = me.username;
  logger.info({ botId: me.id, botUsername }, 'bot.connected');

  await registerCommands();

  if (config.isDev) {
    await startPolling();
  } else {
    await startWebhook(app);
  }
}
