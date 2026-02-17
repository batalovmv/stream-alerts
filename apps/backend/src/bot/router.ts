/**
 * Telegram bot update router.
 *
 * Dispatches incoming updates to appropriate handlers:
 * - /start, /connect, /channels, /test commands
 * - chat_shared service messages (from KeyboardButtonRequestChat)
 * - callback_query (inline keyboard presses)
 * - my_chat_member (bot added/removed from chats)
 */

import type { TelegramUpdate } from '../providers/telegram/telegramApi.js';
import { logger } from '../lib/logger.js';
import { handleStart } from './commands/start.js';
import { handleConnect } from './commands/connect.js';
import { handleChannels } from './commands/channels.js';
import { handleTest } from './commands/test.js';
import { handleChatShared } from './handlers/chatShared.js';
import { handleCallbackQuery } from './handlers/callbackQuery.js';
import { handleMyChatMember } from './handlers/myChatMember.js';
import type { BotContext } from './types.js';

export async function routeUpdate(update: TelegramUpdate): Promise<void> {
  try {
    // ─── Callback Queries (inline keyboard presses) ────────
    if (update.callback_query) {
      const cq = update.callback_query;
      if (cq.data && cq.message) {
        await handleCallbackQuery({
          update,
          callbackQueryId: cq.id,
          chatId: cq.message.chat.id,
          messageId: cq.message.message_id,
          userId: cq.from.id,
          data: cq.data,
        });
      }
      return;
    }

    // ─── my_chat_member (bot added/removed) ────────────────
    if (update.my_chat_member) {
      await handleMyChatMember(update.my_chat_member);
      return;
    }

    // ─── Messages ──────────────────────────────────────────
    const msg = update.message;
    if (!msg) return;

    // Only handle private chat messages for bot commands
    if (msg.chat.type !== 'private') return;

    // chat_shared service message (user selected a chat via native picker)
    if (msg.chat_shared) {
      await handleChatShared(msg);
      return;
    }

    // Text commands
    const text = msg.text?.trim() ?? '';

    // Handle cancel button from reply keyboard
    if (text === '\u274C Отмена' || text.toLowerCase() === 'отмена') {
      const { removeReplyKeyboard } = await import('../providers/telegram/telegramApi.js');
      await removeReplyKeyboard(msg.chat.id, 'Действие отменено.');
      return;
    }

    if (!text.startsWith('/')) return;

    const ctx: BotContext = {
      update,
      message: msg,
      chatId: msg.chat.id,
      userId: msg.from?.id ?? 0,
      username: msg.from?.username,
      text,
    };

    // Parse command (strip @botname suffix)
    const commandMatch = text.match(/^\/(\w+)(@\w+)?(?:\s+(.*))?$/);
    if (!commandMatch) return;

    const command = commandMatch[1].toLowerCase();
    const args = commandMatch[3]?.trim() ?? '';

    switch (command) {
      case 'start':
        await handleStart(ctx, args);
        break;
      case 'connect':
        await handleConnect(ctx);
        break;
      case 'channels':
        await handleChannels(ctx);
        break;
      case 'test':
        await handleTest(ctx);
        break;
      default:
        // Unknown command — ignore silently
        break;
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), updateId: update.update_id },
      'bot.route_error',
    );
  }
}
