/**
 * Telegram bot setup: polling (dev) or webhook (prod).
 *
 * In development mode, uses long polling to receive updates.
 * In production, registers a webhook endpoint on Express.
 */

import type { Express, Request, Response } from 'express';
import * as tg from '../providers/telegram/telegramApi.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { routeUpdate } from './router.js';

const WEBHOOK_PATH = '/api/telegram/webhook';
const WEBHOOK_SECRET = config.webhookSecret || 'tg-webhook-secret';

/** Register bot commands menu in Telegram */
async function registerCommands(): Promise<void> {
  await tg.setMyCommands([
    { command: 'start', description: 'Начать работу / привязать аккаунт' },
    { command: 'connect', description: 'Подключить канал или группу' },
    { command: 'channels', description: 'Мои подключённые каналы' },
    { command: 'test', description: 'Отправить тестовый анонс' },
  ]);
}

/** Start long polling (development mode) */
async function startPolling(): Promise<void> {
  await tg.deleteWebhook();
  logger.info('bot.polling_started');

  let offset: number | undefined;

  async function poll() {
    try {
      const updates = await tg.getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        // Process each update without blocking the poll loop
        routeUpdate(update).catch((err) => {
          logger.error({ err: err instanceof Error ? err.message : String(err) }, 'bot.update_error');
        });
      }
    } catch (error) {
      // On network errors, wait briefly before retrying
      if (error instanceof Error && error.name === 'AbortError') {
        // Timeout is normal for long polling
      } else {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'bot.polling_error');
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    // Schedule next poll
    setImmediate(poll);
  }

  poll();
}

/** Register webhook endpoint on Express app (production mode) */
async function startWebhook(app: Express): Promise<void> {
  const webhookUrl = `https://notify.memelab.ru${WEBHOOK_PATH}`;

  app.post(WEBHOOK_PATH, (req: Request, res: Response) => {
    // Validate secret token header
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== WEBHOOK_SECRET) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const update = req.body as tg.TelegramUpdate;

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

  try {
    const me = await tg.getMe();
    logger.info({ botId: me.id, botUsername: me.username }, 'bot.connected');

    await registerCommands();

    if (config.isDev) {
      await startPolling();
    } else {
      await startWebhook(app);
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'bot.setup_failed',
    );
  }
}
