/**
 * /start command handler.
 *
 * Two modes:
 * 1. /start (no args) — welcome message with instructions
 * 2. /start link_<token> — link Telegram account to MemeLab streamer
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import type { BotContext } from '../types.js';

const LINK_TOKEN_PREFIX = 'link:token:';

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

  const linked = !!streamer;

  const lines = [
    '<b>MemeLab Notify Bot</b>',
    '',
    'Автоматические анонсы стримов в Telegram-каналы и группы.',
    '',
  ];

  if (linked) {
    lines.push(
      `Аккаунт привязан: <b>${streamer.displayName}</b>`,
      '',
      'Доступные команды:',
      '/connect — подключить канал/группу',
      '/channels — мои подключённые каналы',
      '/test — отправить тестовый анонс',
    );
  } else {
    lines.push(
      'Чтобы начать, привяжите аккаунт через дашборд:',
      'https://notify.memelab.ru/dashboard',
      '',
      'Нажмите кнопку «Привязать Telegram» на дашборде.',
    );
  }

  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: lines.join('\n'),
  });
}

async function handleLinkAccount(ctx: BotContext, args: string): Promise<void> {
  const token = args.slice(5); // remove "link_" prefix

  // Atomically consume the token (read + delete in one call) to prevent double-use
  const streamerId = await redis.getdel(LINK_TOKEN_PREFIX + token);

  if (!streamerId) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Ссылка для привязки недействительна или истекла.\n\nСоздайте новую на дашборде: https://notify.memelab.ru/dashboard',
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
      text: `Ваш Telegram уже привязан к аккаунту <b>${existingLink.displayName}</b>.\n\nОтвяжите его на дашборде, чтобы привязать к другому аккаунту.`,
    });
    return;
  }

  // Link the Telegram account
  const streamer = await prisma.streamer.update({
    where: { id: streamerId },
    data: { telegramUserId: String(ctx.userId) },
  });

  logger.info(
    { streamerId, telegramUserId: ctx.userId },
    'bot.account_linked',
  );

  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: [
      `Аккаунт привязан: <b>${streamer.displayName}</b>`,
      '',
      'Теперь вы можете:',
      '/connect — подключить канал/группу',
      '/channels — мои подключённые каналы',
      '/test — отправить тестовый анонс',
    ].join('\n'),
  });
}
