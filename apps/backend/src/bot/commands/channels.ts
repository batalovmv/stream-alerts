/**
 * /channels command handler.
 *
 * Shows all connected chats for the linked streamer
 * with inline keyboard buttons for enable/disable/remove.
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import type { BotContext } from '../types.js';
import { escapeHtml } from '../../lib/escapeHtml.js';

export async function handleChannels(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { orderBy: { createdAt: 'asc' } } },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.\n\nПерейдите на дашборд: https://notify.memelab.ru/dashboard',
    });
    return;
  }

  if (streamer.chats.length === 0) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'У вас нет подключённых каналов.\n\nИспользуйте /connect чтобы добавить канал или группу.',
    });
    return;
  }

  await sendChannelsList(ctx.chatId, streamer.chats);
}

export async function sendChannelsList(
  chatId: number,
  chats: Array<{
    id: string;
    chatTitle: string | null;
    chatId: string;
    chatType: string | null;
    provider: string;
    enabled: boolean;
    deleteAfterEnd: boolean;
  }>,
): Promise<void> {
  const lines = ['<b>Подключённые каналы:</b>', ''];

  const inlineKeyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  for (const chat of chats) {
    const status = chat.enabled ? '\u2705' : '\u26D4';
    const typeEmoji = chat.chatType === 'channel' ? '\uD83D\uDCE2' : '\uD83D\uDC65';
    const title = chat.chatTitle || chat.chatId;
    const deleteLabel = chat.deleteAfterEnd ? '\uD83D\uDDD1' : '';

    lines.push(`${status} ${typeEmoji} <b>${escapeHtml(title)}</b> ${deleteLabel}`);

    // Two buttons per chat: toggle enabled + remove
    const toggleText = chat.enabled ? '\u26D4 Отключить' : '\u2705 Включить';
    inlineKeyboard.push([
      { text: `${toggleText} | ${title.slice(0, 20)}`, callback_data: `toggle:${chat.id}` },
      { text: '\u274C Удалить', callback_data: `remove:${chat.id}` },
    ]);
  }

  await tg.sendMessage({
    chatId: String(chatId),
    text: lines.join('\n'),
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });
}

