/**
 * /preview command handler.
 *
 * Renders the announcement template with test data and shows
 * the result in the chat (with photo) — no actual send to channels.
 */

import * as tg from '../../providers/telegram/telegramApi.js';
import { prisma } from '../../lib/prisma.js';
import { renderTemplate, buildButtons, buildTemplateVars, TEMPLATE_VARIABLE_DOCS } from '../../services/templateService.js';
import { parseStreamPlatforms, parseCustomButtons } from '../../lib/streamPlatforms.js';
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
      replyMarkup: { inline_keyboard: [[{ text: '🔗 Привязать', url: 'https://notify.memelab.ru/dashboard' }]] },
    });
    return;
  }

  const platforms = parseStreamPlatforms(streamer.streamPlatforms);
  const customButtons = parseCustomButtons(streamer.customButtons);

  const templateVars = buildTemplateVars({
    displayName: streamer.displayName,
    platforms,
    channelSlug: streamer.channelSlug || streamer.memelabChannelId,
    twitchLogin: streamer.twitchLogin,
    streamTitle: 'Играем в новый инди-хоррор!',
    gameName: 'Phasmophobia',
    startedAt: new Date().toISOString(),
  });

  const template = streamer.chats[0]?.customTemplate || streamer.defaultTemplate;
  const text = renderTemplate(template, templateVars);
  const buttons = buildButtons(templateVars, customButtons);

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

  const varsList = TEMPLATE_VARIABLE_DOCS
    .map((v) => `<code>{${v.name}}</code> — ${v.description}`)
    .join('\n');

  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: '👁 <b>Предпросмотр</b>\n\n'
      + '👆 Так будет выглядеть анонс.\n\n'
      + `Переменные:\n${varsList}`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '📝 Изменить шаблон', callback_data: 'menu:settings' }],
        BACK_TO_MENU_ROW,
      ],
    },
  });
}
