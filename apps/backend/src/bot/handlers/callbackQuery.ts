/**
 * Callback query handler for inline keyboard interactions.
 *
 * Handles:
 * - menu:<command> — main menu button presses (edit-in-place or new message)
 * - toggle:<chatId> — enable/disable a connected chat
 * - remove:<chatId> — disconnect a chat (with confirmation)
 * - confirm_remove:<chatId> — confirmed removal
 * - test:<chatId> — send test announcement to specific chat
 * - test:all — send test to all enabled chats
 * - settings:* / stg_* — settings sub-screens
 */

import { prisma } from '../../lib/prisma.js';
import * as tg from '../../providers/telegram/telegramApi.js';
import { handleChannels } from '../commands/channels.js';
import { handleConnect } from '../commands/connect.js';
import { handlePreview } from '../commands/preview.js';
import {
  handleSettings,
  handleSettingsCallback,
  handleSettingsToggle,
  handleSettingsDelete,
  handleSettingsTemplate,
  handleSettingsBack,
} from '../commands/settings.js';
import { handleStats } from '../commands/stats.js';
import { handleTest } from '../commands/test.js';
import type { BotContext, CallbackContext } from '../types.js';
import { editToMainMenu } from '../ui.js';

import {
  handleToggle,
  handleRemovePrompt,
  handleConfirmRemove,
  handleCancelRemove,
  handleTestCallback,
} from './callbackChannels.js';

export async function handleCallbackQuery(ctx: CallbackContext): Promise<void> {
  const { data, userId, callbackQueryId } = ctx;

  const colonIdx = data.indexOf(':');
  const action = colonIdx === -1 ? data : data.slice(0, colonIdx);
  const targetId = colonIdx === -1 ? '' : data.slice(colonIdx + 1);

  // Find the streamer
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(userId) },
    include: { chats: true },
  });

  if (!streamer) {
    await tg.answerCallbackQuery({ callbackQueryId, text: 'Аккаунт не привязан', showAlert: true });
    return;
  }

  try {
    switch (action) {
      case 'menu':
        await handleMenuButton(ctx, targetId);
        return;

      case 'toggle':
        await handleToggle(ctx, streamer, targetId);
        break;

      case 'remove':
        await handleRemovePrompt(ctx, streamer, targetId);
        break;

      case 'confirm_remove':
        await handleConfirmRemove(ctx, streamer, targetId);
        break;

      case 'cancel_remove':
        await handleCancelRemove(ctx, streamer);
        break;

      case 'test':
        await handleTestCallback(ctx, streamer, targetId);
        break;

      case 'settings':
        await handleSettingsCallback(ctx, targetId);
        break;

      case 'stg_toggle':
        await handleSettingsToggle(ctx, targetId);
        break;

      case 'stg_delete':
        await handleSettingsDelete(ctx, targetId);
        break;

      case 'stg_template':
        await handleSettingsTemplate(ctx, targetId);
        break;

      case 'stg_back':
        await handleSettingsBack(ctx);
        break;

      default:
        await tg.answerCallbackQuery({ callbackQueryId });
        break;
    }
  } catch (error) {
    // Always answer the callback query to dismiss Telegram's loading spinner
    try {
      await tg.answerCallbackQuery({ callbackQueryId, text: 'Произошла ошибка', showAlert: true });
    } catch {
      /* best-effort */
    }
    throw error;
  }
}

/** Handle main menu inline button presses — dispatches to command handlers */
async function handleMenuButton(ctx: CallbackContext, command: string): Promise<void> {
  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });

  // "Back to menu" — edit the current message in-place
  if (command === 'main') {
    await editToMainMenu(ctx.chatId, ctx.messageId, ctx.userId);
    return;
  }

  // connect is special — it uses reply keyboard (native Telegram chat picker),
  // so it must always send a new message
  if (command === 'connect') {
    const botCtx = buildBotContext(ctx);
    await handleConnect(botCtx);
    return;
  }

  // preview is special — it sends a photo as a new message
  if (command === 'preview') {
    const botCtx = buildBotContext(ctx);
    await handlePreview(botCtx);
    return;
  }

  // For other commands, send as new message (they include back-to-menu buttons)
  const botCtx = buildBotContext(ctx);
  const handlers: Record<string, () => Promise<void>> = {
    channels: () => handleChannels(botCtx),
    settings: () => handleSettings(botCtx),
    test: () => handleTest(botCtx),
    stats: () => handleStats(botCtx),
  };

  const handler = handlers[command];
  if (handler) {
    await handler();
  }
}

/** Build a BotContext from CallbackContext for dispatching to command handlers */
function buildBotContext(ctx: CallbackContext): BotContext {
  return {
    update: ctx.update,
    message: ctx.update.callback_query?.message ?? {
      message_id: ctx.messageId,
      chat: { id: ctx.chatId, type: 'private' },
      date: Math.floor(Date.now() / 1000),
    },
    chatId: ctx.chatId,
    userId: ctx.userId,
    text: '',
  };
}
