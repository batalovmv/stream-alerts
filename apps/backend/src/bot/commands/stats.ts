/**
 * /stats command handler.
 *
 * Shows announcement statistics from AnnouncementLog:
 * total, sent, failed, last announcement.
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import type { BotContext } from '../types.js';

export async function handleStats(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { select: { id: true } } },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.\n\nПерейдите на дашборд: https://notify.memelab.ru/dashboard',
    });
    return;
  }

  const chatIds = streamer.chats.map((c) => c.id);

  if (chatIds.length === 0) {
    await tg.sendMessage({ chatId: String(ctx.chatId), text: 'Нет подключённых каналов.' });
    return;
  }

  const [total, sentCount, failedCount, lastAnnouncement] = await Promise.all([
    prisma.announcementLog.count({ where: { chatId: { in: chatIds } } }),
    prisma.announcementLog.count({ where: { chatId: { in: chatIds }, status: 'sent' } }),
    prisma.announcementLog.count({ where: { chatId: { in: chatIds }, status: 'failed' } }),
    prisma.announcementLog.findFirst({
      where: { chatId: { in: chatIds }, status: 'sent' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true, chat: { select: { chatTitle: true } } },
    }),
  ]);

  let text = '📊 <b>Статистика анонсов</b>\n\n';
  text += `Всего: ${total}\n`;
  text += `✅ Отправлено: ${sentCount}\n`;
  text += `❌ Ошибок: ${failedCount}\n`;

  if (lastAnnouncement?.sentAt) {
    const date = lastAnnouncement.sentAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    text += `\n🕐 Последний: ${date}`;
    if (lastAnnouncement.chat?.chatTitle) {
      text += ` → ${lastAnnouncement.chat.chatTitle}`;
    }
  }

  await tg.sendMessage({ chatId: String(ctx.chatId), text });
}
