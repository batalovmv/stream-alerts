/**
 * my_chat_member handler.
 *
 * Detects when the bot is added to or removed from a group/channel.
 * Acts as a fallback catch-all for any method of adding the bot.
 */

import type { TelegramChatMemberUpdated } from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

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

    // If the user who added the bot has a linked streamer account,
    // and this chat isn't already connected, we could auto-connect.
    // But the primary flow is via /connect → request_chat, so we just log here.
    // The chat_shared handler does the actual ConnectedChat creation.
  }

  if (wasIn && isOut) {
    // Bot was removed from a chat — disable all subscriptions for this chat
    const chatIdStr = String(chat.id);

    const disconnected = await prisma.connectedChat.updateMany({
      where: {
        provider: 'telegram',
        chatId: chatIdStr,
      },
      data: { enabled: false },
    });

    if (disconnected.count > 0) {
      logger.info(
        { chatId: chat.id, chatTitle: chat.title, disabledCount: disconnected.count },
        'bot.removed_from_chat',
      );
    }
  }
}
