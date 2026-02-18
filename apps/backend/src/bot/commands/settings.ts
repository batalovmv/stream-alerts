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
      text: 'Сначала привяжите аккаунт.\n\nПерейдите на дашборд: https://notify.memelab.ru/dashboard',
    });
    return;
  }

  if (streamer.chats.length === 0) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'У вас нет подключённых каналов.\n\nИспользуйте /connect чтобы добавить канал или группу.',
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
    text: `${chat.enabled ? '🟢' : '🔴'} ${chat.chatTitle || chat.chatId}`,
    callback_data: `settings:${chat.id}`,
  }]);

  await tg.sendMessage({
    chatId: String(chatId),
    text: '⚙️ <b>Настройки каналов</b>\n\nВыберите канал для настройки:',
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
    `⚙️ <b>${title}</b>`,
    '',
    `Статус: ${chat.enabled ? '🟢 Активен' : '🔴 Выключен'}`,
    `Удалять после стрима: ${chat.deleteAfterEnd ? '✅ Да' : '❌ Нет'}`,
    `Шаблон: ${chat.customTemplate ? '📝 Свой' : '📋 Стандартный'}`,
  ].join('\n');

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [
    [
      { text: chat.enabled ? '🔴 Выключить' : '🟢 Включить', callback_data: `stg_toggle:${chat.id}` },
      { text: chat.deleteAfterEnd ? '❌ Не удалять' : '✅ Удалять после', callback_data: `stg_delete:${chat.id}` },
    ],
    [{ text: '📝 Изменить шаблон', callback_data: `stg_template:${chat.id}` }],
    [{ text: '◀️ Назад', callback_data: 'stg_back' }],
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

  // Refresh settings view
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
    text: chat.deleteAfterEnd ? 'Удаление после стрима выключено' : 'Удаление после стрима включено',
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
    text: '📝 Отправьте новый шаблон анонса.\n\n'
      + 'Доступные переменные:\n'
      + '<code>{streamer_name}</code> — имя стримера\n'
      + '<code>{stream_title}</code> — название стрима\n'
      + '<code>{game_name}</code> — игра\n\n'
      + 'Отправьте <code>reset</code> чтобы сбросить на стандартный.\n'
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

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = streamer.chats.map((chat) => [{
    text: `${chat.enabled ? '🟢' : '🔴'} ${chat.chatTitle || chat.chatId}`,
    callback_data: `settings:${chat.id}`,
  }]);

  await tg.editMessageText({
    chatId: String(ctx.chatId),
    messageId: ctx.messageId,
    text: '⚙️ <b>Настройки каналов</b>\n\nВыберите канал для настройки:',
    replyMarkup: { inline_keyboard: keyboard },
  });
}

export async function handleTemplateTextInput(chatId: number, userId: number, text: string): Promise<void> {
  const chatDbId = await redis.getdel(PENDING_TEMPLATE_PREFIX + userId);
  if (!chatDbId) return;

  // Verify ownership: the chat must belong to this user's streamer account
  const streamer = await prisma.streamer.findUnique({ where: { telegramUserId: String(userId) } });
  const chat = streamer
    ? await prisma.connectedChat.findFirst({ where: { id: chatDbId, streamerId: streamer.id } })
    : null;

  if (!chat || !streamer) {
    await tg.sendMessage({ chatId: String(chatId), text: '❌ Канал не найден или не принадлежит вашему аккаунту.' });
    return;
  }

  // Validate template length (same limit as REST API)
  const MAX_TEMPLATE_LENGTH = 2000;
  if (text.length > MAX_TEMPLATE_LENGTH) {
    // Restore pending state so user can retry with shorter text
    await redis.setex(PENDING_TEMPLATE_PREFIX + userId, PENDING_TEMPLATE_TTL, chatDbId);
    await tg.sendMessage({ chatId: String(chatId), text: `❌ Шаблон слишком длинный (${text.length}/${MAX_TEMPLATE_LENGTH} символов). Сократите текст и отправьте снова.` });
    return;
  }

  if (text.toLowerCase() === 'reset') {
    await prisma.connectedChat.update({
      where: { id: chatDbId, streamerId: streamer.id },
      data: { customTemplate: null },
    });
    await tg.sendMessage({ chatId: String(chatId), text: '✅ Шаблон сброшен на стандартный.' });
    return;
  }

  await prisma.connectedChat.update({
    where: { id: chatDbId, streamerId: streamer.id },
    data: { customTemplate: text },
  });
  await tg.sendMessage({ chatId: String(chatId), text: '✅ Шаблон обновлён!\n\nИспользуйте /preview чтобы посмотреть результат.' });
}

