/**
 * /settings command handler.
 *
 * Shows inline buttons for each connected chat.
 * Tapping a chat shows: toggle enabled, toggle deleteAfterEnd, edit template.
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import type { BotContext, CallbackContext } from '../types.js';
import { escapeHtml } from '../../lib/escapeHtml.js';
import { renderTemplate, buildDefaultButtons } from '../../services/templateService.js';
import { BACK_TO_MENU_ROW } from '../ui.js';

const PENDING_TEMPLATE_PREFIX = 'pending:template:';
const PENDING_TEMPLATE_TTL = 300; // 5 minutes

export async function handleSettings(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { orderBy: { createdAt: 'asc' } } },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.',
      replyMarkup: { inline_keyboard: [[{ text: '\u{1F517} Привязать', url: 'https://notify.memelab.ru/dashboard' }]] },
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
  chats: Array<{ id: string; chatTitle: string | null; chatId: string; enabled: boolean; deleteAfterEnd: boolean; customTemplate: string | null }>,
): Promise<void> {
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = chats.map((chat) => [{
    text: `${chat.enabled ? '\u{1F7E2}' : '\u{1F534}'} ${chat.chatTitle || chat.chatId}`,
    callback_data: `settings:${chat.id}`,
  }]);

  keyboard.push(BACK_TO_MENU_ROW);

  await tg.sendMessage({
    chatId: String(chatId),
    text: '\u{2699}\u{FE0F} <b>Настройки</b>\n\nВыберите канал:',
    replyMarkup: { inline_keyboard: keyboard },
  });
}

export async function handleSettingsCallback(ctx: CallbackContext, chatDbId: string): Promise<void> {
  const chat = await prisma.connectedChat.findUnique({ where: { id: chatDbId }, include: { streamer: true } });
  if (!chat || chat.streamer.telegramUserId !== String(ctx.userId)) {
    await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Канал не найден', showAlert: true });
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
      { text: chat.enabled ? '\u{1F534} Выключить' : '\u{1F7E2} Включить', callback_data: `stg_toggle:${chat.id}` },
      { text: chat.deleteAfterEnd ? '\u{274C} Не удалять' : '\u{1F5D1} Удалять', callback_data: `stg_delete:${chat.id}` },
    ],
    [{ text: '\u{1F4DD} Изменить шаблон', callback_data: `stg_template:${chat.id}` }],
    [
      { text: '\u{25C0}\u{FE0F} Настройки', callback_data: 'stg_back' },
      { text: '\u{25C0}\u{FE0F} Меню', callback_data: 'menu:main' },
    ],
  ];

  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });
  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text,
    replyMarkup: { inline_keyboard: keyboard },
  });
}

export async function handleSettingsToggle(ctx: CallbackContext, chatDbId: string): Promise<void> {
  const chat = await prisma.connectedChat.findUnique({ where: { id: chatDbId }, include: { streamer: true } });
  if (!chat || chat.streamer.telegramUserId !== String(ctx.userId)) {
    await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Канал не найден', showAlert: true });
    return;
  }

  await prisma.connectedChat.update({
    where: { id: chatDbId },
    data: { enabled: !chat.enabled },
  });

  await tg.answerCallbackQuery({
    callbackQueryId: ctx.callbackQueryId,
    text: chat.enabled ? 'Канал выключен' : 'Канал включён',
  });

  // Refresh settings view in-place
  await handleSettingsCallback(ctx, chatDbId);
}

export async function handleSettingsDelete(ctx: CallbackContext, chatDbId: string): Promise<void> {
  const chat = await prisma.connectedChat.findUnique({ where: { id: chatDbId }, include: { streamer: true } });
  if (!chat || chat.streamer.telegramUserId !== String(ctx.userId)) {
    await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Канал не найден', showAlert: true });
    return;
  }

  await prisma.connectedChat.update({
    where: { id: chatDbId },
    data: { deleteAfterEnd: !chat.deleteAfterEnd },
  });

  await tg.answerCallbackQuery({
    callbackQueryId: ctx.callbackQueryId,
    text: chat.deleteAfterEnd ? 'Удаление выключено' : 'Удаление включено',
  });

  await handleSettingsCallback(ctx, chatDbId);
}

export async function getPendingTemplateEdit(userId: number): Promise<string | undefined> {
  const val = await redis.get(PENDING_TEMPLATE_PREFIX + userId);
  return val ?? undefined;
}

export async function clearPendingTemplateEdit(userId: number): Promise<void> {
  await redis.del(PENDING_TEMPLATE_PREFIX + userId);
}

export async function handleSettingsTemplate(ctx: CallbackContext, chatDbId: string): Promise<void> {
  // Verify ownership before storing pending edit state
  const chat = await prisma.connectedChat.findUnique({ where: { id: chatDbId }, include: { streamer: true } });
  if (!chat || chat.streamer.telegramUserId !== String(ctx.userId)) {
    await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Канал не найден', showAlert: true });
    return;
  }

  await redis.setex(PENDING_TEMPLATE_PREFIX + ctx.userId, PENDING_TEMPLATE_TTL, chatDbId);

  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });
  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: '\u{1F4DD} Отправьте новый шаблон анонса.\n\n'
      + 'Переменные:\n'
      + '<code>{streamer_name}</code> — имя стримера\n'
      + '<code>{stream_title}</code> — название стрима\n'
      + '<code>{game_name}</code> — игра\n'
      + '<code>{stream_url}</code> — ссылка на стрим\n'
      + '<code>{memelab_url}</code> — ссылка на MemeLab\n\n'
      + '<code>reset</code> — сбросить на стандартный\n'
      + '/cancel — отмена',
  });
}

export async function handleSettingsBack(ctx: CallbackContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { orderBy: { createdAt: 'asc' } } },
  });

  if (!streamer) {
    await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId, text: 'Аккаунт не найден', showAlert: true });
    return;
  }

  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = streamer.chats.map((chat: { id: string; chatTitle: string | null; chatId: string; enabled: boolean }) => [{
    text: `${chat.enabled ? '\u{1F7E2}' : '\u{1F534}'} ${chat.chatTitle || chat.chatId}`,
    callback_data: `settings:${chat.id}`,
  }]);

  keyboard.push(BACK_TO_MENU_ROW);

  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text: '\u{2699}\u{FE0F} <b>Настройки</b>\n\nВыберите канал:',
    replyMarkup: { inline_keyboard: keyboard },
  });
}

export async function handleTemplateTextInput(chatId: number, userId: number, text: string): Promise<void> {
  const chatDbId = await redis.getdel(PENDING_TEMPLATE_PREFIX + userId);
  if (!chatDbId) {
    await tg.sendMessage({
      chatId: String(chatId),
      text: '\u{23F0} Сессия редактирования шаблона истекла.\n\nОткройте /settings и нажмите \u{00AB}Изменить шаблон\u{00BB} снова.',
    });
    return;
  }

  // Verify ownership: the chat must belong to this user's streamer account
  const streamer = await prisma.streamer.findUnique({ where: { telegramUserId: String(userId) } });
  const chat = streamer
    ? await prisma.connectedChat.findFirst({ where: { id: chatDbId, streamerId: streamer.id } })
    : null;

  if (!chat || !streamer) {
    await tg.sendMessage({ chatId: String(chatId), text: '\u{274C} Канал не найден или не принадлежит вашему аккаунту.' });
    return;
  }

  // Validate template length (same limit as REST API)
  const MAX_TEMPLATE_LENGTH = 2000;
  if (text.length > MAX_TEMPLATE_LENGTH) {
    // Restore pending state so user can retry with shorter text
    await redis.setex(PENDING_TEMPLATE_PREFIX + userId, PENDING_TEMPLATE_TTL, chatDbId);
    await tg.sendMessage({ chatId: String(chatId), text: `\u{274C} Шаблон слишком длинный (${text.length}/${MAX_TEMPLATE_LENGTH}). Сократите и отправьте снова.` });
    return;
  }

  if (text.toLowerCase() === 'reset') {
    await prisma.connectedChat.update({
      where: { id: chatDbId, streamerId: streamer.id },
      data: { customTemplate: null },
    });
    await tg.sendMessage({
      chatId: String(chatId),
      text: '\u{2705} Шаблон сброшен на стандартный.',
      replyMarkup: { inline_keyboard: [BACK_TO_MENU_ROW] },
    });
    return;
  }

  await prisma.connectedChat.update({
    where: { id: chatDbId, streamerId: streamer.id },
    data: { customTemplate: text },
  });

  // Auto-preview the saved template
  const previewVars = {
    streamer_name: streamer.displayName,
    stream_title: 'Играем в новый инди-хоррор!',
    game_name: 'Phasmophobia',
    stream_url: streamer.twitchLogin ? `https://twitch.tv/${streamer.twitchLogin}` : undefined,
    memelab_url: `https://memelab.ru/${streamer.memelabChannelId}`,
  };
  const previewText = renderTemplate(text, previewVars);
  const buttons = buildDefaultButtons(previewVars);
  await tg.sendMessage({
    chatId: String(chatId),
    text: `\u{2705} Шаблон обновлён!\n\n${previewText}`,
    buttons: buttons.map((b) => ({ label: b.label, url: b.url })),
  });
}
