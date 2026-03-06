/**
 * /settings command handler.
 *
 * Shows inline buttons for each connected chat.
 * Tapping a chat shows: toggle enabled, toggle deleteAfterEnd, edit template.
 */

import { escapeHtml } from '../../lib/escapeHtml.js';
import { prisma } from '../../lib/prisma.js';
import * as tg from '../../providers/telegram/telegramApi.js';
import type { BotContext, CallbackContext } from '../types.js';
import { BACK_TO_MENU_ROW } from '../ui.js';

// Re-export template handlers from settingsTemplate.ts
export {
  handleSettingsTemplate,
  handleTemplateTextInput,
  getPendingTemplateEdit,
  clearPendingTemplateEdit,
} from './settingsTemplate.js';

export async function handleSettings(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { orderBy: { createdAt: 'asc' } } },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '\u{1F517} Привязать', url: 'https://notify.memelab.ru/dashboard' }],
        ],
      },
    });
    return;
  }

  if (streamer.chats.length === 0) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: '\u{2699}\u{FE0F} <b>Настройки</b>\n\nУ вас пока нет подключённых каналов.',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '\u{1F4E1} Подключить канал', callback_data: 'menu:connect' }],
          BACK_TO_MENU_ROW,
        ],
      },
    });
    return;
  }

  await sendSettingsMenu(ctx.chatId, streamer.chats);
}

export async function sendSettingsMenu(
  chatId: number,
  chats: Array<{
    id: string;
    chatTitle: string | null;
    chatId: string;
    enabled: boolean;
    deleteAfterEnd: boolean;
    customTemplate: string | null;
  }>,
): Promise<void> {
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = chats.map((chat) => [
    {
      text: `${chat.enabled ? '\u{1F7E2}' : '\u{1F534}'} ${chat.chatTitle || chat.chatId}`,
      callback_data: `settings:${chat.id}`,
    },
  ]);

  keyboard.push(BACK_TO_MENU_ROW);

  await tg.sendMessage({
    chatId: String(chatId),
    text: '\u{2699}\u{FE0F} <b>Настройки</b>\n\nВыберите канал:',
    replyMarkup: { inline_keyboard: keyboard },
  });
}

export async function handleSettingsCallback(
  ctx: CallbackContext,
  chatDbId: string,
  skipAnswer = false,
): Promise<void> {
  const chat = await prisma.connectedChat.findUnique({
    where: { id: chatDbId },
    include: { streamer: true },
  });
  if (!chat || chat.streamer.telegramUserId !== String(ctx.userId)) {
    if (!skipAnswer)
      await tg.answerCallbackQuery({
        callbackQueryId: ctx.callbackQueryId,
        text: 'Канал не найден',
        showAlert: true,
      });
    return;
  }

  const title = escapeHtml(chat.chatTitle || chat.chatId);
  const text = [
    `\u{2699}\u{FE0F} <b>${title}</b>`,
    '',
    `\u{1F4A1} Статус: ${chat.enabled ? '\u{1F7E2} Активен' : '\u{1F534} Выключен'}`,
    `\u{1F5D1} Удалять после стрима: ${chat.deleteAfterEnd ? '\u2705 Да' : '\u274C Нет'}`,
    `\u{1F4DD} Шаблон: ${chat.customTemplate ? 'Свой' : 'Стандартный'}`,
  ].join('\n');

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [
    [
      {
        text: chat.enabled ? '\u{1F534} Выключить' : '\u{1F7E2} Включить',
        callback_data: `stg_toggle:${chat.id}`,
      },
      {
        text: chat.deleteAfterEnd ? '\u{274C} Не удалять' : '\u{1F5D1} Удалять',
        callback_data: `stg_delete:${chat.id}`,
      },
    ],
    [{ text: '\u{1F4DD} Изменить шаблон', callback_data: `stg_template:${chat.id}` }],
    [
      { text: '\u{25C0}\u{FE0F} Настройки', callback_data: 'stg_back' },
      { text: '\u{25C0}\u{FE0F} Меню', callback_data: 'menu:main' },
    ],
  ];

  if (!skipAnswer) await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });
  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text,
    replyMarkup: { inline_keyboard: keyboard },
  });
}

export async function handleSettingsToggle(ctx: CallbackContext, chatDbId: string): Promise<void> {
  const chat = await prisma.connectedChat.findUnique({
    where: { id: chatDbId },
    include: { streamer: true },
  });
  if (!chat || chat.streamer.telegramUserId !== String(ctx.userId)) {
    await tg.answerCallbackQuery({
      callbackQueryId: ctx.callbackQueryId,
      text: 'Канал не найден',
      showAlert: true,
    });
    return;
  }

  await prisma.connectedChat.update({
    where: { id: chatDbId, streamerId: chat.streamerId },
    data: { enabled: !chat.enabled },
  });

  await tg.answerCallbackQuery({
    callbackQueryId: ctx.callbackQueryId,
    text: chat.enabled ? 'Канал выключен' : 'Канал включён',
  });

  // Refresh settings view in-place (skipAnswer=true since we already answered above)
  await handleSettingsCallback(ctx, chatDbId, true);
}

export async function handleSettingsDelete(ctx: CallbackContext, chatDbId: string): Promise<void> {
  const chat = await prisma.connectedChat.findUnique({
    where: { id: chatDbId },
    include: { streamer: true },
  });
  if (!chat || chat.streamer.telegramUserId !== String(ctx.userId)) {
    await tg.answerCallbackQuery({
      callbackQueryId: ctx.callbackQueryId,
      text: 'Канал не найден',
      showAlert: true,
    });
    return;
  }

  await prisma.connectedChat.update({
    where: { id: chatDbId, streamerId: chat.streamerId },
    data: { deleteAfterEnd: !chat.deleteAfterEnd },
  });

  await tg.answerCallbackQuery({
    callbackQueryId: ctx.callbackQueryId,
    text: chat.deleteAfterEnd ? 'Удаление выключено' : 'Удаление включено',
  });

  // Refresh settings view in-place (skipAnswer=true since we already answered above)
  await handleSettingsCallback(ctx, chatDbId, true);
}

export async function handleSettingsBack(ctx: CallbackContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { orderBy: { createdAt: 'asc' } } },
  });

  if (!streamer) {
    await tg.answerCallbackQuery({
      callbackQueryId: ctx.callbackQueryId,
      text: 'Аккаунт не найден',
      showAlert: true,
    });
    return;
  }

  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = streamer.chats.map(
    (chat: { id: string; chatTitle: string | null; chatId: string; enabled: boolean }) => [
      {
        text: `${chat.enabled ? '\u{1F7E2}' : '\u{1F534}'} ${chat.chatTitle || chat.chatId}`,
        callback_data: `settings:${chat.id}`,
      },
    ],
  );

  keyboard.push(BACK_TO_MENU_ROW);

  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text: '\u{2699}\u{FE0F} <b>Настройки</b>\n\nВыберите канал:',
    replyMarkup: { inline_keyboard: keyboard },
  });
}
