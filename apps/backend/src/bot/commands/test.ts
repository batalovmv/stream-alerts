/**
 * /test command handler.
 *
 * Sends a test announcement to all enabled chats,
 * or lets the user pick a specific chat if they have multiple.
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { getProvider } from '../../providers/registry.js';
import { renderTemplate, buildDefaultButtons } from '../../services/templateService.js';
import { logger } from '../../lib/logger.js';
import type { BotContext } from '../types.js';
import { escapeHtml } from '../../lib/escapeHtml.js';

export async function handleTest(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { where: { enabled: true } } },
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
      text: 'Нет подключённых каналов.\n\nИспользуйте /connect чтобы добавить канал или группу.',
    });
    return;
  }

  // If multiple chats, let the user choose
  if (streamer.chats.length > 1) {
    const keyboard = streamer.chats.map((chat) => [
      {
        text: `${chat.chatTitle || chat.chatId}`,
        callback_data: `test:${chat.id}`,
      },
    ]);

    keyboard.push([{ text: '\uD83D\uDCE3 Отправить во все', callback_data: 'test:all' }]);

    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Куда отправить тестовый анонс?',
      replyMarkup: { inline_keyboard: keyboard },
    });
    return;
  }

  // Single chat — ask for confirmation first
  const chatTitle = streamer.chats[0].chatTitle || streamer.chats[0].chatId;
  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: `Отправить тестовый анонс в <b>${escapeHtml(chatTitle)}</b>?`,
    replyMarkup: {
      inline_keyboard: [[
        { text: '✅ Отправить', callback_data: `test:${streamer.chats[0].id}` },
        { text: '❌ Отмена', callback_data: 'test:cancel' },
      ]],
    },
  });
}

export async function sendTestAnnouncement(
  streamer: { displayName: string; twitchLogin: string | null; memelabChannelId: string; defaultTemplate: string | null },
  chat: { chatId: string; provider: string; customTemplate: string | null },
): Promise<{ success: boolean; error?: string }> {
  const vars = {
    streamer_name: streamer.displayName,
    stream_title: 'Тестовый стрим',
    game_name: 'Just Chatting',
    stream_url: streamer.twitchLogin ? `https://twitch.tv/${streamer.twitchLogin}` : undefined,
    memelab_url: `https://memelab.ru/${streamer.memelabChannelId}`,
  };

  const text = renderTemplate(chat.customTemplate || streamer.defaultTemplate, vars);
  const buttons = buildDefaultButtons(vars);

  try {
    const provider = getProvider(chat.provider);
    await provider.sendAnnouncement(chat.chatId, { text, buttons });
    return { success: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ chatId: chat.chatId, error: errMsg }, 'bot.test_failed');
    return { success: false, error: errMsg };
  }
}

