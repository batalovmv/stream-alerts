/**
 * /preview command handler.
 *
 * Renders the announcement template with test data and shows
 * the result in the chat (with photo) — no actual send to channels.
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { renderTemplate, buildDefaultButtons } from '../../services/templateService.js';
import type { BotContext } from '../types.js';
import { BACK_TO_MENU_ROW } from '../ui.js';

/** Static placeholder image for preview (Twitch live thumbnails only work during active streams) */
const PREVIEW_PLACEHOLDER_URL = 'https://static-cdn.jtvnw.net/ttv-static/404_preview-640x360.jpg';

export async function handlePreview(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { select: { customTemplate: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.',
      replyMarkup: { inline_keyboard: [[{ text: '\u{1F517} Привязать', url: 'https://notify.memelab.ru/dashboard' }]] },
    });
    return;
  }

  const templateVars = {
    streamer_name: streamer.displayName,
    stream_title: 'Играем в новый инди-хоррор!',
    game_name: 'Phasmophobia',
    stream_url: streamer.twitchLogin ? `https://twitch.tv/${streamer.twitchLogin}` : undefined,
    memelab_url: `https://memelab.ru/${streamer.memelabChannelId}`,
  };

  const template = streamer.chats[0]?.customTemplate || streamer.defaultTemplate;
  const text = renderTemplate(template, templateVars);
  const buttons = buildDefaultButtons(templateVars);

  // Use static placeholder — live Twitch thumbnails only work during active streams
  const photoUrl = PREVIEW_PLACEHOLDER_URL;

  try {
    await tg.sendPhoto({
      chatId: String(ctx.chatId),
      photoUrl,
      caption: text,
      buttons,
    });
  } catch {
    // Photo URL unavailable — fall back to text-only
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text,
      buttons: buttons.map((b) => ({ label: b.label, url: b.url })),
    });
  }

  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: '\u{1F441} <b>Предпросмотр</b>\n\n'
      + '\u{1F446} Так будет выглядеть анонс.\n\n'
      + 'Переменные: <code>{streamer_name}</code>, <code>{stream_title}</code>, <code>{game_name}</code>, '
      + '<code>{stream_url}</code>, <code>{memelab_url}</code>',
    replyMarkup: {
      inline_keyboard: [
        [{ text: '\u{1F4DD} Изменить шаблон', callback_data: 'menu:settings' }],
        BACK_TO_MENU_ROW,
      ],
    },
  });
}
