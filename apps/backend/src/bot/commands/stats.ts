/**
 * /stats command handler.
 *
 * Shows announcement statistics from AnnouncementLog:
 * total, sent, failed, last announcement.
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import type { BotContext } from '../types.js';
import { escapeHtml } from '../../lib/escapeHtml.js';
import { BACK_TO_MENU_ROW } from '../ui.js';

export async function handleStats(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { select: { id: true } } },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.',
      replyMarkup: { inline_keyboard: [[{ text: '\u{1F517} Привязать', url: 'https://notify.memelab.ru/dashboard' }]] },
    });
    return;
  }

  const chatIds = streamer.chats.map((c: { id: string }) => c.id);

  if (chatIds.length === 0) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: '\u{1F4CA} <b>Статистика</b>\n\nНет подключённых каналов.',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '\u{1F4E1} Подключить канал', callback_data: 'menu:connect' }],
          BACK_TO_MENU_ROW,
        ],
      },
    });
    return;
  }

  const [sentCount, failedCount, deletedCount, lastAnnouncement] = await Promise.all([
    prisma.announcementLog.count({ where: { chatId: { in: chatIds }, status: 'sent' } }),
    prisma.announcementLog.count({ where: { chatId: { in: chatIds }, status: 'failed' } }),
    prisma.announcementLog.count({ where: { chatId: { in: chatIds }, status: 'deleted' } }),
    prisma.announcementLog.findFirst({
      where: { chatId: { in: chatIds }, status: 'sent' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true, chat: { select: { chatTitle: true } } },
    }),
  ]);

  const total = sentCount + failedCount + deletedCount;

  let text = '\u{1F4CA} <b>Статистика анонсов</b>\n\n';
  text += `Всего: ${total}\n`;
  text += `\u2705 Отправлено: ${sentCount}\n`;
  text += `\u{1F5D1} Удалено: ${deletedCount}\n`;
  text += `\u274C Ошибок: ${failedCount}\n`;

  if (lastAnnouncement?.sentAt) {
    const date = lastAnnouncement.sentAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    text += `\n\u{1F551} Последний: ${date}`;
    if (lastAnnouncement.chat?.chatTitle) {
      text += ` \u2192 ${escapeHtml(lastAnnouncement.chat.chatTitle)}`;
    }
  }

  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text,
    replyMarkup: { inline_keyboard: [BACK_TO_MENU_ROW] },
  });
}
