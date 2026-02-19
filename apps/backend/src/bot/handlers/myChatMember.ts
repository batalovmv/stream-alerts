/**
 * my_chat_member handler.
 *
 * Detects when the bot is added to or removed from a group/channel.
 * Acts as a fallback catch-all for any method of adding the bot.
 */

import type { TelegramChatMemberUpdated } from '../../providers/telegram/telegramApi.js';
import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { escapeHtml } from '../../lib/escapeHtml.js';

const LEFT_STATUSES = new Set(['left', 'kicked']);
const MEMBER_STATUSES = new Set(['member', 'administrator', 'creator']);

export async function handleMyChatMember(update: TelegramChatMemberUpdated): Promise<void> {
  const { chat, from, old_chat_member, new_chat_member } = update;

  const wasOut = LEFT_STATUSES.has(old_chat_member.status);
  const isIn = MEMBER_STATUSES.has(new_chat_member.status);
  const wasIn = MEMBER_STATUSES.has(old_chat_member.status);
  const isOut = LEFT_STATUSES.has(new_chat_member.status);

  if (wasOut && isIn) {
    // Bot was added to a chat
    logger.info(
      {
        chatId: chat.id,
        chatTitle: chat.title,
        chatType: chat.type,
        addedBy: from.id,
        botStatus: new_chat_member.status,
      },
      'bot.added_to_chat',
    );
  }

  if (wasIn && isOut) {
    // Bot was removed from a chat — disable subscriptions and notify affected streamers
    const chatIdStr = String(chat.id);
    const chatTitle = chat.title ?? chatIdStr;

    // Find all affected chats with their streamers (to notify each one)
    const affectedChats = await prisma.connectedChat.findMany({
      where: { provider: 'telegram', chatId: chatIdStr, enabled: true },
      include: { streamer: { select: { id: true, telegramUserId: true } } },
    });

    if (affectedChats.length === 0) return;

    // Disable each chat individually (scoped per-streamer)
    await prisma.connectedChat.updateMany({
      where: {
        provider: 'telegram',
        chatId: chatIdStr,
        enabled: true,
      },
      data: { enabled: false },
    });

    logger.info(
      { chatId: chat.id, chatTitle, disabledCount: affectedChats.length },
      'bot.removed_from_chat',
    );

    // Notify each affected streamer via DM
    for (const affected of affectedChats) {
      if (!affected.streamer.telegramUserId) continue;
      try {
        await tg.sendMessage({
          chatId: affected.streamer.telegramUserId,
          text: `⚠️ Бот был удалён из <b>${escapeHtml(chatTitle)}</b>.\n\n`
            + 'Анонсы в этот чат приостановлены.\n'
            + 'Используйте /connect чтобы подключить заново или /channels для управления.',
        });
      } catch {
        // Streamer may have blocked the bot — ignore
      }
    }
  }
}
