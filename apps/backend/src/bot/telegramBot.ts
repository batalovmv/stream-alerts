/**
 * Telegram bot with long-polling for handling user commands.
 * Uses the same native fetch approach as telegramApi.ts.
 */

import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

const TELEGRAM_API = 'https://api.telegram.org';
const POLL_TIMEOUT = 30;

let running = false;
let offset = 0;

function botUrl(method: string): string {
  return `${TELEGRAM_API}/bot${config.telegramBotToken}/${method}`;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; title?: string };
    from?: { id: number; first_name: string; username?: string };
    text?: string;
  };
}

async function getUpdates(): Promise<TelegramUpdate[]> {
  try {
    const res = await fetch(botUrl('getUpdates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset, timeout: POLL_TIMEOUT }),
    });
    const data = await res.json() as { ok: boolean; result?: TelegramUpdate[] };
    return data.ok ? data.result ?? [] : [];
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'bot.poll_error');
    return [];
  }
}

async function reply(chatId: number, text: string): Promise<void> {
  await fetch(botUrl('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function handleCommand(text: string, chatId: number): Promise<void> {
  const cmd = text.split(/\s|@/)[0].toLowerCase();

  switch (cmd) {
    case '/start':
    case '/help':
      await reply(chatId, [
        '<b>MemeLab Notify Bot</b>',
        '',
        'Автоматические анонсы стримов в ваши каналы и группы.',
        '',
        '<b>Команды:</b>',
        '/start — Приветствие',
        '/status — Статус подключённых каналов',
        '/chatid — Узнать ID этого чата',
        '',
        `Настройка: https://notify.memelab.ru`,
      ].join('\n'));
      break;

    case '/status': {
      const chats = await prisma.connectedChat.findMany({
        where: { chatId: String(chatId), provider: 'telegram', enabled: true },
        include: { streamer: { select: { displayName: true } } },
      });

      if (chats.length === 0) {
        await reply(chatId, 'Этот чат не подключён ни к одному стримеру.\n\nНастройте на https://notify.memelab.ru');
        return;
      }

      const lines = chats.map((c: { streamer: { displayName: string } }) => `• ${c.streamer.displayName}`);
      await reply(chatId, `<b>Подключённые стримеры:</b>\n${lines.join('\n')}`);
      break;
    }

    case '/chatid':
      await reply(chatId, `Chat ID: <code>${chatId}</code>`);
      break;
  }
}

async function pollLoop(): Promise<void> {
  while (running) {
    const updates = await getUpdates();

    for (const update of updates) {
      offset = update.update_id + 1;

      if (update.message?.text?.startsWith('/')) {
        await handleCommand(update.message.text, update.message.chat.id).catch((err) => {
          logger.error({ error: err instanceof Error ? err.message : String(err) }, 'bot.command_error');
        });
      }
    }
  }
}

export function startTelegramBot(): void {
  if (!config.telegramBotToken) return;
  running = true;
  pollLoop();
  logger.info('Telegram bot polling started');
}

export function stopTelegramBot(): void {
  running = false;
  logger.info('Telegram bot polling stopped');
}
