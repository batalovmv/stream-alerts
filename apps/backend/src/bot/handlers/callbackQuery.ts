/**
 * Callback query handler for inline keyboard interactions.
 *
 * Handles:
 * - toggle:<chatId> — enable/disable a connected chat
 * - remove:<chatId> — disconnect a chat (with confirmation)
 * - confirm_remove:<chatId> — confirmed removal
 * - test:<chatId> — send test announcement to specific chat
 * - test:all — send test to all enabled chats
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { sendChannelsList } from '../commands/channels.js';
import { sendTestAnnouncement } from '../commands/test.js';
import type { CallbackContext } from '../types.js';

export async function handleCallbackQuery(ctx: CallbackContext): Promise<void> {
  const { data, userId, callbackQueryId, chatId, messageId } = ctx;

  const [action, targetId] = data.split(':');

  // Find the streamer
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(userId) },
    include: { chats: true },
  });

  if (!streamer) {
    await tg.answerCallbackQuery({ callbackQueryId, text: 'Аккаунт не привязан', showAlert: true });
    return;
  }

  switch (action) {
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

    default:
      await tg.answerCallbackQuery({ callbackQueryId });
      break;
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

  const updated = await prisma.connectedChat.update({
    where: { id: chatDbId },
    data: { enabled: !chat.enabled },
  });

  const statusText = updated.enabled ? 'включён' : 'отключён';
  await tg.answerCallbackQuery({
    callbackQueryId: ctx.callbackQueryId,
    text: `${chat.chatTitle || chat.chatId}: ${statusText}`,
  });

  // Refresh the channels list
  const freshChats = await prisma.connectedChat.findMany({
    where: { streamerId: streamer.id },
    orderBy: { createdAt: 'asc' },
  });

  // Delete old message and send updated list
  try {
    await tg.deleteMessageApi(String(ctx.chatId), ctx.messageId);
  } catch {
    // Ignore if message can't be deleted
  }

  await sendChannelsList(ctx.chatId, freshChats);
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

  await prisma.connectedChat.delete({ where: { id: chatDbId } });

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
      text: 'Все каналы отключены.\n\nИспользуйте /connect чтобы добавить новый.',
    });
  } else {
    try {
      await tg.deleteMessageApi(String(ctx.chatId), ctx.messageId);
    } catch {
      // Ignore
    }
    await sendChannelsList(ctx.chatId, freshChats);
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

  try {
    await tg.deleteMessageApi(String(ctx.chatId), ctx.messageId);
  } catch {
    // Ignore
  }

  await sendChannelsList(ctx.chatId, freshChats);
}

async function handleTestCallback(
  ctx: CallbackContext,
  streamer: { id: string; displayName: string; twitchLogin: string | null; memelabChannelId: string; defaultTemplate: string | null; chats: Array<{ id: string; chatId: string; chatTitle: string | null; provider: string; customTemplate: string | null; enabled: boolean }> },
  targetId: string,
): Promise<void> {
  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Отправляю...' });

  const chatsToTest = targetId === 'all'
    ? streamer.chats.filter((c) => c.enabled)
    : streamer.chats.filter((c) => c.id === targetId);

  if (chatsToTest.length === 0) {
    await tg.editMessageText({
      chatId: String(ctx.chatId),
      messageId: ctx.messageId,
      text: 'Нет доступных каналов для теста.',
    });
    return;
  }

  const results: string[] = [];

  for (const chat of chatsToTest) {
    const result = await sendTestAnnouncement(streamer, chat);
    const title = escapeHtml(chat.chatTitle || chat.chatId);
    results.push(result.success ? `\u2705 ${title}` : `\u274C ${title}: ${result.error}`);
  }

  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text: `<b>Результаты тестовой отправки:</b>\n\n${results.join('\n')}`,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
