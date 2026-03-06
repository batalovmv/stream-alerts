/**
 * Callback handlers for channel toggle/remove operations.
 *
 * Extracted from callbackQuery.ts to keep files under 300 lines.
 */

import { escapeHtml } from '../../lib/escapeHtml.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import * as tg from '../../providers/telegram/telegramApi.js';
import { buildChannelsListContent } from '../commands/channels.js';
import { sendTestAnnouncement } from '../commands/test.js';
import type { CallbackContext } from '../types.js';
import { BACK_TO_MENU_ROW } from '../ui.js';

export async function handleToggle(
  ctx: CallbackContext,
  streamer: {
    id: string;
    chats: Array<{
      id: string;
      enabled: boolean;
      chatTitle: string | null;
      chatId: string;
      chatType: string | null;
      provider: string;
      deleteAfterEnd: boolean;
    }>;
  },
  chatDbId: string,
): Promise<void> {
  const chat = streamer.chats.find((c) => c.id === chatDbId);
  if (!chat) {
    await tg.answerCallbackQuery({
      callbackQueryId: ctx.callbackQueryId,
      text: 'Канал не найден',
      showAlert: true,
    });
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
    take: 100,
  });

  const { text: listText, replyMarkup } = buildChannelsListContent(freshChats);
  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text: listText,
    replyMarkup,
  });
}

export async function handleRemovePrompt(
  ctx: CallbackContext,
  streamer: { chats: Array<{ id: string; chatTitle: string | null; chatId: string }> },
  chatDbId: string,
): Promise<void> {
  const chat = streamer.chats.find((c) => c.id === chatDbId);
  if (!chat) {
    await tg.answerCallbackQuery({
      callbackQueryId: ctx.callbackQueryId,
      text: 'Канал не найден',
      showAlert: true,
    });
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

export async function handleConfirmRemove(
  ctx: CallbackContext,
  streamer: { id: string; chats: Array<{ id: string; chatTitle: string | null; chatId: string }> },
  chatDbId: string,
): Promise<void> {
  const chat = streamer.chats.find((c) => c.id === chatDbId);
  if (!chat) {
    await tg.answerCallbackQuery({
      callbackQueryId: ctx.callbackQueryId,
      text: 'Канал не найден',
      showAlert: true,
    });
    return;
  }

  try {
    await prisma.connectedChat.delete({ where: { id: chatDbId, streamerId: streamer.id } });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2025') {
      await tg.answerCallbackQuery({
        callbackQueryId: ctx.callbackQueryId,
        text: 'Канал уже удалён',
        showAlert: true,
      });
      return;
    }
    throw error;
  }

  logger.info({ chatId: chat.chatId, streamerId: streamer.id }, 'bot.chat_removed');

  await tg.answerCallbackQuery({
    callbackQueryId: ctx.callbackQueryId,
    text: `${chat.chatTitle || chat.chatId} удалён`,
  });

  // Refresh the list
  const freshChats = await prisma.connectedChat.findMany({
    where: { streamerId: streamer.id },
    orderBy: { createdAt: 'asc' },
    take: 100,
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

export async function handleCancelRemove(
  ctx: CallbackContext,
  streamer: { id: string },
): Promise<void> {
  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });

  const freshChats = await prisma.connectedChat.findMany({
    where: { streamerId: streamer.id },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  const { text, replyMarkup } = buildChannelsListContent(freshChats);
  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text,
    replyMarkup,
  });
}

export async function handleTestCallback(
  ctx: CallbackContext,
  streamer: {
    id: string;
    displayName: string;
    twitchLogin: string | null;
    memelabChannelId: string;
    channelSlug: string;
    defaultTemplate: string | null;
    streamPlatforms: unknown;
    customButtons: unknown;
    customBotToken: string | null;
    chats: Array<{
      id: string;
      chatId: string;
      chatTitle: string | null;
      provider: string;
      customTemplate: string | null;
      enabled: boolean;
    }>;
  },
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

  const chatsToTest =
    targetId === 'all'
      ? streamer.chats.filter((c) => c.enabled)
      : streamer.chats.filter((c) => c.id === targetId);

  if (chatsToTest.length === 0) {
    const msg =
      targetId && targetId !== 'all'
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
    results.push(
      result.success ? `\u2705 ${title}` : `\u274C ${title}: ${escapeHtml(result.error ?? '')}`,
    );
  }

  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text: `\u{1F4E3} <b>Результаты тестовой отправки:</b>\n\n${results.join('\n')}`,
    replyMarkup: { inline_keyboard: [BACK_TO_MENU_ROW] },
  });
}
