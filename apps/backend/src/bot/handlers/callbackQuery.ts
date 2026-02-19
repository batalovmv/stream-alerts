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

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { sendChannelsList, buildChannelsListContent } from '../commands/channels.js';
import { handleConnect } from '../commands/connect.js';
import { handleChannels } from '../commands/channels.js';
import { handleSettings } from '../commands/settings.js';
import { handleTest } from '../commands/test.js';
import { handlePreview } from '../commands/preview.js';
import { handleStats } from '../commands/stats.js';
import { sendTestAnnouncement } from '../commands/test.js';
import {
  handleSettingsCallback,
  handleSettingsToggle,
  handleSettingsDelete,
  handleSettingsTemplate,
  handleSettingsBack,
} from '../commands/settings.js';
import type { BotContext, CallbackContext } from '../types.js';
import { escapeHtml } from '../../lib/escapeHtml.js';
import { editToMainMenu, BACK_TO_MENU_ROW } from '../ui.js';

export async function handleCallbackQuery(ctx: CallbackContext): Promise<void> {
  const { data, userId, callbackQueryId, chatId, messageId } = ctx;

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
    } catch { /* best-effort */ }
    throw error;
  }
}

async function handleToggle(
  ctx: CallbackContext,
  streamer: { id: string; chats: Array<{ id: string; enabled: boolean; chatTitle: string | null; chatId: string; chatType: string | null; provider: string; deleteAfterEnd: boolean }> },
  chatDbId: string,
): Promise<void> {
  const chat = streamer.chats.find((c) => c.id === chatDbId);
  if (!chat) {
    await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Канал не найден', showAlert: true });
    return;
  }

  // Use streamerId in where clause to prevent TOCTOU authorization bypass
  const updated = await prisma.connectedChat.update({
    where: { id: chatDbId, streamerId: streamer.id },
    data: { enabled: !chat.enabled },
  });

  const statusText = updated.enabled ? 'включён' : 'отключён';
  await tg.answerCallbackQuery({
    callbackQueryId: ctx.callbackQueryId,
    text: `${chat.chatTitle || chat.chatId}: ${statusText}`,
  });

  // Refresh the channels list in-place (edit instead of delete+send to avoid flicker)
  const freshChats = await prisma.connectedChat.findMany({
    where: { streamerId: streamer.id },
    orderBy: { createdAt: 'asc' },
  });

  const { text: listText, replyMarkup } = buildChannelsListContent(freshChats);
  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text: listText,
    replyMarkup,
  });
}

async function handleRemovePrompt(
  ctx: CallbackContext,
  streamer: { chats: Array<{ id: string; chatTitle: string | null; chatId: string }> },
  chatDbId: string,
): Promise<void> {
  const chat = streamer.chats.find((c) => c.id === chatDbId);
  if (!chat) {
    await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Канал не найден', showAlert: true });
    return;
  }

  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });

  const title = escapeHtml(chat.chatTitle || chat.chatId);

  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text: `Удалить <b>${title}</b> из подключённых каналов?`,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '\u2705 Да, удалить', callback_data: `confirm_remove:${chatDbId}` },
          { text: '\u274C Отмена', callback_data: 'cancel_remove:0' },
        ],
      ],
    },
  });
}

async function handleConfirmRemove(
  ctx: CallbackContext,
  streamer: { id: string; chats: Array<{ id: string; chatTitle: string | null; chatId: string }> },
  chatDbId: string,
): Promise<void> {
  const chat = streamer.chats.find((c) => c.id === chatDbId);
  if (!chat) {
    await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Канал не найден', showAlert: true });
    return;
  }

  await prisma.connectedChat.delete({ where: { id: chatDbId, streamerId: streamer.id } });

  logger.info({ chatId: chat.chatId, streamerId: streamer.id }, 'bot.chat_removed');

  await tg.answerCallbackQuery({
    callbackQueryId: ctx.callbackQueryId,
    text: `${chat.chatTitle || chat.chatId} удалён`,
  });

  // Refresh the list
  const freshChats = await prisma.connectedChat.findMany({
    where: { streamerId: streamer.id },
    orderBy: { createdAt: 'asc' },
  });

  if (freshChats.length === 0) {
    await tg.editMessageText({
      chatId: String(ctx.chatId),
      messageId: ctx.messageId,
      text: '\u{1F4CB} <b>Мои каналы</b>\n\nВсе каналы отключены.',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '\u{1F4E1} Подключить канал', callback_data: 'menu:connect' }],
          BACK_TO_MENU_ROW,
        ],
      },
    });
  } else {
    const { text: listText, replyMarkup } = buildChannelsListContent(freshChats);
    await tg.editMessageText({
      chatId: String(ctx.chatId),
      messageId: ctx.messageId,
      text: listText,
      replyMarkup,
    });
  }
}

async function handleCancelRemove(
  ctx: CallbackContext,
  streamer: { id: string },
): Promise<void> {
  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });

  const freshChats = await prisma.connectedChat.findMany({
    where: { streamerId: streamer.id },
    orderBy: { createdAt: 'asc' },
  });

  const { text, replyMarkup } = buildChannelsListContent(freshChats);
  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text,
    replyMarkup,
  });
}

async function handleTestCallback(
  ctx: CallbackContext,
  streamer: { id: string; displayName: string; twitchLogin: string | null; memelabChannelId: string; channelSlug: string; defaultTemplate: string | null; streamPlatforms: unknown; customButtons: unknown; chats: Array<{ id: string; chatId: string; chatTitle: string | null; provider: string; customTemplate: string | null; enabled: boolean }> },
  targetId: string,
): Promise<void> {
  // Handle cancel
  if (targetId === 'cancel') {
    await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });
    await tg.editMessageText({
      chatId: String(ctx.chatId),
      messageId: ctx.messageId,
      text: '\u{1F4E3} Тестовая отправка отменена.',
      replyMarkup: { inline_keyboard: [BACK_TO_MENU_ROW] },
    });
    return;
  }

  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Отправляю...' });

  const chatsToTest = targetId === 'all'
    ? streamer.chats.filter((c) => c.enabled)
    : streamer.chats.filter((c) => c.id === targetId);

  if (chatsToTest.length === 0) {
    const msg = targetId && targetId !== 'all'
      ? 'Канал не найден — возможно, он был удалён.'
      : 'Нет доступных каналов для теста.';
    await tg.editMessageText({
      chatId: String(ctx.chatId),
      messageId: ctx.messageId,
      text: msg,
      replyMarkup: { inline_keyboard: [BACK_TO_MENU_ROW] },
    });
    return;
  }

  const results: string[] = [];

  for (const chat of chatsToTest) {
    const result = await sendTestAnnouncement(streamer, chat);
    const title = escapeHtml(chat.chatTitle || chat.chatId);
    results.push(result.success ? `\u2705 ${title}` : `\u274C ${title}: ${escapeHtml(result.error ?? '')}`);
  }

  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text: `\u{1F4E3} <b>Результаты тестовой отправки:</b>\n\n${results.join('\n')}`,
    replyMarkup: { inline_keyboard: [BACK_TO_MENU_ROW] },
  });
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
    message: ctx.update.callback_query?.message ?? { message_id: ctx.messageId, chat: { id: ctx.chatId, type: 'private' }, date: Math.floor(Date.now() / 1000) },
    chatId: ctx.chatId,
    userId: ctx.userId,
    text: '',
  };
}
