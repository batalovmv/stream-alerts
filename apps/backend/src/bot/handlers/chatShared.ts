/**
 * chat_shared handler.
 *
 * Triggered when the user selects a chat from the native picker
 * (KeyboardButtonRequestChat). The bot has already been auto-added
 * as admin with the requested permissions.
 */

import type { TelegramMessage } from '../../providers/telegram/telegramApi.js';
import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { REQUEST_ID_GROUP, REQUEST_ID_CHANNEL } from '../commands/connect.js';
import { escapeHtml } from '../../lib/escapeHtml.js';

export async function handleChatShared(msg: TelegramMessage): Promise<void> {
  const shared = msg.chat_shared;
  if (!shared) return;

  const userId = msg.from?.id;
  if (!userId) return;

  const chatId = msg.chat.id; // private chat where the button was pressed

  // Find the linked streamer
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(userId) },
  });

  if (!streamer) {
    await tg.removeReplyKeyboard(
      chatId,
      'Ваш аккаунт не привязан. Перейдите на дашборд: https://notify.memelab.ru/dashboard',
    );
    return;
  }

  const selectedChatId = String(shared.chat_id);
  const isChannel = shared.request_id === REQUEST_ID_CHANNEL;
  const chatType = isChannel ? 'channel' : (shared.request_id === REQUEST_ID_GROUP ? 'group' : 'unknown');

  // Try to get fresh chat info from Telegram API
  let chatTitle = shared.title ?? null;
  let resolvedChatType = chatType;

  try {
    const chatInfo = await tg.getChat(selectedChatId);
    chatTitle = chatInfo.title ?? chatTitle;
    if (chatInfo.type === 'supergroup') resolvedChatType = 'supergroup';
    else if (chatInfo.type === 'channel') resolvedChatType = 'channel';
    else if (chatInfo.type === 'group') resolvedChatType = 'group';
  } catch {
    // Use data from chat_shared if getChat fails
  }

  // Verify bot has admin access
  let hasAccess = false;
  try {
    const member = await tg.getBotChatMember(selectedChatId);
    hasAccess = member.status === 'administrator' || member.status === 'creator';
  } catch {
    // Bot may not have access yet (race condition with auto-add)
  }

  if (!hasAccess) {
    // Give Telegram a moment to process the auto-add, then retry once
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const member = await tg.getBotChatMember(selectedChatId);
      hasAccess = member.status === 'administrator' || member.status === 'creator';
    } catch {
      // Still no access
    }
  }

  if (!hasAccess) {
    await tg.removeReplyKeyboard(
      chatId,
      [
        '⚠️ Бот не смог получить права администратора в выбранном чате.',
        '',
        'Автоматическое добавление не сработало. Пожалуйста:',
        '1. Откройте настройки чата',
        '2. Добавьте @MemelabNotifyBot как администратора вручную',
        '3. Попробуйте /connect снова',
      ].join('\n'),
    );
    return;
  }

  // Enforce per-streamer chat limit
  const MAX_CHATS_PER_STREAMER = 20;
  const chatCount = await prisma.connectedChat.count({ where: { streamerId: streamer.id } });
  if (chatCount >= MAX_CHATS_PER_STREAMER) {
    await tg.removeReplyKeyboard(
      chatId,
      `Достигнут лимит подключённых каналов (${MAX_CHATS_PER_STREAMER}).\n\nУдалите ненужные через /channels, затем попробуйте снова.`,
    );
    return;
  }

  // Check for duplicate
  const existing = await prisma.connectedChat.findUnique({
    where: {
      streamerId_provider_chatId: {
        streamerId: streamer.id,
        provider: 'telegram',
        chatId: selectedChatId,
      },
    },
  });

  if (existing) {
    await tg.removeReplyKeyboard(
      chatId,
      `<b>${escapeHtml(chatTitle || selectedChatId)}</b> уже подключён.\n\nИспользуйте /channels для управления.`,
    );
    return;
  }

  // Save the connected chat
  try {
    await prisma.connectedChat.create({
      data: {
        streamerId: streamer.id,
        provider: 'telegram',
        chatId: selectedChatId,
        chatTitle,
        chatType: resolvedChatType,
      },
    });
  } catch (error) {
    logger.error(
      { streamerId: streamer.id, chatId: selectedChatId, error: error instanceof Error ? error.message : String(error) },
      'bot.chat_connect_failed',
    );
    await tg.removeReplyKeyboard(
      chatId,
      'Не удалось сохранить подключение. Попробуйте /connect ещё раз.',
    );
    return;
  }

  logger.info(
    { streamerId: streamer.id, chatId: selectedChatId, chatTitle, chatType: resolvedChatType },
    'bot.chat_connected',
  );

  await tg.removeReplyKeyboard(
    chatId,
    [
      `<b>${escapeHtml(chatTitle || selectedChatId)}</b> подключён!`,
      '',
      'Теперь анонсы стримов будут автоматически отправляться в этот чат.',
      '',
      '/test — отправить тестовый анонс',
      '/channels — управление каналами',
    ].join('\n'),
  );
}

