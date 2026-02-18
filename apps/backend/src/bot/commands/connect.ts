/**
 * /connect command handler.
 *
 * Shows native Telegram chat picker (KeyboardButtonRequestChat)
 * so the user can select a group or channel without knowing any IDs.
 * The bot is automatically added as admin with required permissions.
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import type { BotContext } from '../types.js';

/** request_id values to distinguish groups from channels */
export const REQUEST_ID_GROUP = 1;
export const REQUEST_ID_CHANNEL = 2;

export async function handleConnect(ctx: BotContext): Promise<void> {
  // Check account is linked
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.',
      replyMarkup: { inline_keyboard: [[{ text: '\u{1F517} Привязать', url: 'https://notify.memelab.ru/dashboard' }]] },
    });
    return;
  }

  // Rights the bot needs in the selected chat
  const botAdminRights = {
    can_post_messages: true,
    can_edit_messages: true,
    can_delete_messages: true,
  };

  // User must have at least the same rights as the bot + can_invite_users.
  // Telegram API requires bot_administrator_rights to be a SUBSET of user_administrator_rights.
  const userAdminRights = {
    can_post_messages: true,
    can_edit_messages: true,
    can_delete_messages: true,
    can_invite_users: true,
  };

  // Send reply keyboard with chat picker buttons
  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: 'Выберите канал или группу для анонсов:',
    replyMarkup: {
      keyboard: [
        [
          {
            text: '\uD83D\uDC65 Выбрать группу',
            request_chat: {
              request_id: REQUEST_ID_GROUP,
              chat_is_channel: false,
              user_administrator_rights: userAdminRights,
              bot_administrator_rights: botAdminRights,
              bot_is_member: true,
              request_title: true,
              request_username: true,
            },
          },
        ],
        [
          {
            text: '\uD83D\uDCE2 Выбрать канал',
            request_chat: {
              request_id: REQUEST_ID_CHANNEL,
              chat_is_channel: true,
              user_administrator_rights: userAdminRights,
              bot_administrator_rights: botAdminRights,
              bot_is_member: true,
              request_title: true,
              request_username: true,
            },
          },
        ],
        [
          {
            text: '\u274C Отмена',
          },
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}
