/**
 * /test command handler.
 *
 * Sends a test announcement to all enabled chats,
 * or lets the user pick a specific chat if they have multiple.
 */

import { escapeHtml } from '../../lib/escapeHtml.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { resolveProvider } from '../../lib/resolveProvider.js';
import { parseStreamPlatforms, parseCustomButtons } from '../../lib/streamPlatforms.js';
import * as tg from '../../providers/telegram/telegramApi.js';
import { renderTemplate, buildButtons, buildTemplateVars } from '../../services/templateService.js';
import type { BotContext } from '../types.js';
import { BACK_TO_MENU_ROW } from '../ui.js';

export async function handleTest(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { where: { enabled: true } } },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.',
      replyMarkup: {
        inline_keyboard: [[{ text: '🔗 Привязать', url: 'https://notify.memelab.ru/dashboard' }]],
      },
    });
    return;
  }

  if (streamer.chats.length === 0) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: '📣 <b>Тестовый анонс</b>\n\nНет включённых каналов.',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📡 Подключить канал', callback_data: 'menu:connect' }],
          BACK_TO_MENU_ROW,
        ],
      },
    });
    return;
  }

  // If multiple chats, let the user choose
  if (streamer.chats.length > 1) {
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = streamer.chats.map(
      (chat: { id: string; chatTitle: string | null; chatId: string }) => [
        {
          text: `${chat.chatTitle || chat.chatId}`,
          callback_data: `test:${chat.id}`,
        },
      ],
    );

    keyboard.push([{ text: '📣 Отправить во все', callback_data: 'test:all' }]);
    keyboard.push(BACK_TO_MENU_ROW);

    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: '📣 <b>Тестовый анонс</b>\n\nКуда отправить?',
      replyMarkup: { inline_keyboard: keyboard },
    });
    return;
  }

  // Single chat — ask for confirmation first
  const chatTitle = streamer.chats[0].chatTitle || streamer.chats[0].chatId;
  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: `📣 Отправить тестовый анонс в <b>${escapeHtml(chatTitle)}</b>?`,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Отправить', callback_data: `test:${streamer.chats[0].id}` },
          { text: '❌ Отмена', callback_data: 'test:cancel' },
        ],
        BACK_TO_MENU_ROW,
      ],
    },
  });
}

export async function sendTestAnnouncement(
  streamer: {
    displayName: string;
    twitchLogin: string | null;
    memelabChannelId: string;
    channelSlug: string;
    defaultTemplate: string | null;
    streamPlatforms: unknown;
    customButtons: unknown;
    customBotToken: string | null;
  },
  chat: { chatId: string; provider: string; customTemplate: string | null },
): Promise<{ success: boolean; error?: string }> {
  const platforms = parseStreamPlatforms(streamer.streamPlatforms);
  const customButtons = parseCustomButtons(streamer.customButtons);

  const vars = buildTemplateVars({
    displayName: streamer.displayName,
    platforms,
    channelSlug: streamer.channelSlug || streamer.memelabChannelId,
    twitchLogin: streamer.twitchLogin,
    streamTitle: 'Тестовый стрим',
    gameName: 'Just Chatting',
    startedAt: new Date().toISOString(),
  });

  const text = renderTemplate(chat.customTemplate || streamer.defaultTemplate, vars);
  const buttons = buildButtons(vars, customButtons);

  try {
    const provider = resolveProvider(chat.provider, streamer.customBotToken);
    await provider.sendAnnouncement(chat.chatId, { text, buttons });
    return { success: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ chatId: chat.chatId, error: errMsg }, 'bot.test_failed');
    return { success: false, error: errMsg };
  }
}
