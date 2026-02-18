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
import { BACK_TO_MENU_ROW } from '../ui.js';

export async function handleChannels(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { orderBy: { createdAt: 'asc' } } },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.',
      replyMarkup: { inline_keyboard: [[{ text: '\u{1F517} Привязать', url: 'https://notify.memelab.ru/dashboard' }]] },
    });
    return;
  }

  if (streamer.chats.length === 0) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: '\u{1F4CB} <b>Мои каналы</b>\n\nУ вас пока нет подключённых каналов.',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '\u{1F4E1} Подключить канал', callback_data: 'menu:connect' }],
          BACK_TO_MENU_ROW,
        ],
      },
    });
    return;
  }

  await sendChannelsList(ctx.chatId, streamer.chats);
}

export type ChatListItem = {
  id: string;
  chatTitle: string | null;
  chatId: string;
  chatType: string | null;
  provider: string;
  enabled: boolean;
  deleteAfterEnd: boolean;
};

/** Build channels list text + keyboard (reusable for both send and edit) */
export function buildChannelsListContent(chats: ChatListItem[]): {
  text: string;
  replyMarkup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
} {
  const lines = ['\u{1F4CB} <b>Мои каналы</b>', ''];
  const inlineKeyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  for (const chat of chats) {
    const status = chat.enabled ? '\u2705' : '\u26D4';
    const typeEmoji = chat.chatType === 'channel' ? '\uD83D\uDCE2' : '\uD83D\uDC65';
    const title = chat.chatTitle || chat.chatId;
    const deleteLabel = chat.deleteAfterEnd ? ' \uD83D\uDDD1' : '';

    lines.push(`${status} ${typeEmoji} <b>${escapeHtml(title)}</b>${deleteLabel}`);

    const toggleText = chat.enabled ? '\u26D4 Откл' : '\u2705 Вкл';
    inlineKeyboard.push([
      { text: `${toggleText} | ${[...title].slice(0, 20).join('')}`, callback_data: `toggle:${chat.id}` },
      { text: '\u{274C}', callback_data: `remove:${chat.id}` },
    ]);
  }

  // Navigation buttons
  inlineKeyboard.push(BACK_TO_MENU_ROW);

  return { text: lines.join('\n'), replyMarkup: { inline_keyboard: inlineKeyboard } };
}

export async function sendChannelsList(chatId: number, chats: ChatListItem[]): Promise<void> {
  const { text, replyMarkup } = buildChannelsListContent(chats);
  await tg.sendMessage({ chatId: String(chatId), text, replyMarkup });
}
