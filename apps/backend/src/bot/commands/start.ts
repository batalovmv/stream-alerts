/**
 * /start command handler.
 *
 * Two modes:
 * 1. /start (no args) — welcome message with inline button menu
 * 2. /start link_<token> — link Telegram account to MemeLab streamer
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import type { BotContext } from '../types.js';
import { escapeHtml } from '../../lib/escapeHtml.js';

const LINK_TOKEN_PREFIX = 'link:token:';

/** Inline button menu for linked users */
const MAIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '\u{1F4E1} Подключить канал', callback_data: 'menu:connect' },
      { text: '\u{1F4CB} Мои каналы', callback_data: 'menu:channels' },
    ],
    [
      { text: '\u{2699}\u{FE0F} Настройки', callback_data: 'menu:settings' },
      { text: '\u{1F4E3} Тест анонса', callback_data: 'menu:test' },
    ],
    [
      { text: '\u{1F441} Предпросмотр', callback_data: 'menu:preview' },
      { text: '\u{1F4CA} Статистика', callback_data: 'menu:stats' },
    ],
    [
      { text: '\u{1F310} Открыть дашборд', url: 'https://notify.memelab.ru/dashboard' },
    ],
  ],
};

export async function handleStart(ctx: BotContext, args: string): Promise<void> {
  // ─── Account linking via deep link ───────────────────────
  if (args.startsWith('link_')) {
    await handleLinkAccount(ctx, args);
    return;
  }

  // ─── Welcome message ────────────────────────────────────
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
  });

  if (streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: [
        '\u{1F7E3} <b>MemeLab Notify</b>',
        '',
        `\u{1F464} <b>${escapeHtml(streamer.displayName)}</b>`,
        '',
        'Выберите действие:',
      ].join('\n'),
      replyMarkup: MAIN_MENU_KEYBOARD,
    });
  } else {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: [
        '\u{1F7E3} <b>MemeLab Notify</b>',
        '',
        'Автоматические анонсы стримов в Telegram-каналы и группы.',
        '',
        'Для начала привяжите аккаунт:',
      ].join('\n'),
      replyMarkup: {
        inline_keyboard: [
          [{ text: '\u{1F517} Привязать аккаунт', url: 'https://notify.memelab.ru/dashboard' }],
        ],
      },
    });
  }
}

async function handleLinkAccount(ctx: BotContext, args: string): Promise<void> {
  const token = args.slice(5); // remove "link_" prefix

  // Atomically consume the token (read + delete in one call) to prevent double-use
  const streamerId = await redis.getdel(LINK_TOKEN_PREFIX + token);

  if (!streamerId) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: '\u{274C} Ссылка для привязки недействительна или истекла.',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '\u{1F504} Создать новую ссылку', url: 'https://notify.memelab.ru/dashboard' }],
        ],
      },
    });
    return;
  }

  // Check if this Telegram user is already linked to another streamer
  const existingLink = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
  });

  if (existingLink && existingLink.id !== streamerId) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: '\u{26A0}\u{FE0F} Ваш Telegram уже привязан к другому аккаунту.\n\nОтвяжите его на дашборде, чтобы привязать к другому.',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '\u{1F310} Открыть дашборд', url: 'https://notify.memelab.ru/dashboard' }],
        ],
      },
    });
    return;
  }

  // Already linked to the same streamer — no-op with friendly message
  if (existingLink && existingLink.id === streamerId) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: `\u{2705} Аккаунт <b>${escapeHtml(existingLink.displayName)}</b> уже привязан.`,
      replyMarkup: MAIN_MENU_KEYBOARD,
    });
    return;
  }

  // Atomically link only if not already linked (prevents TOCTOU race)
  const { count } = await prisma.streamer.updateMany({
    where: { id: streamerId, telegramUserId: null },
    data: { telegramUserId: String(ctx.userId) },
  });

  if (count === 0) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: '\u{274C} Не удалось привязать аккаунт — возможно, он уже привязан.',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '\u{1F504} Создать новую ссылку', url: 'https://notify.memelab.ru/dashboard' }],
        ],
      },
    });
    return;
  }

  const streamer = await prisma.streamer.findUniqueOrThrow({ where: { id: streamerId } });

  logger.info(
    { streamerId, telegramUserId: ctx.userId },
    'bot.account_linked',
  );

  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: [
      `\u{2705} Аккаунт привязан: <b>${escapeHtml(streamer.displayName)}</b>`,
      '',
      'Выберите действие:',
    ].join('\n'),
    replyMarkup: MAIN_MENU_KEYBOARD,
  });
}
