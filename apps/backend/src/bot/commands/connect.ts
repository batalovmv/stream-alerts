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
      text: 'Сначала привяжите аккаунт.\n\nПерейдите на дашборд и нажмите «Привязать Telegram»:\nhttps://notify.memelab.ru/dashboard',
    });
    return;
  }

  // Build the admin rights the bot needs
  const botAdminRights = {
    can_post_messages: true,
    can_edit_messages: true,
    can_delete_messages: true,
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
              bot_administrator_rights: botAdminRights,
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
              bot_administrator_rights: botAdminRights,
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
