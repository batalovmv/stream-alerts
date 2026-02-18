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

export async function handlePreview(ctx: BotContext): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(ctx.userId) },
    include: { chats: { select: { customTemplate: true }, take: 1 } },
  });

  if (!streamer) {
    await tg.sendMessage({
      chatId: String(ctx.chatId),
      text: 'Сначала привяжите аккаунт.\n\nПерейдите на дашборд: https://notify.memelab.ru/dashboard',
    });
    return;
  }

  const templateVars = {
    streamer_name: streamer.displayName,
    stream_title: 'Играем в новый инди-хоррор!',
    game_name: 'Phasmophobia',
    stream_url: streamer.twitchLogin ? `https://twitch.tv/${streamer.twitchLogin}` : undefined,
    memelab_url: `https://memelab.ru/preview`,
  };

  const template = streamer.chats[0]?.customTemplate || streamer.defaultTemplate;
  const text = renderTemplate(template, templateVars);
  const buttons = buildDefaultButtons(templateVars);
  const photoUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${streamer.twitchLogin ?? 'test'}-640x360.jpg`;

  await tg.sendPhoto({
    chatId: String(ctx.chatId),
    photoUrl,
    caption: text,
    buttons,
  });

  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text: '👆 Так будет выглядеть анонс.\n\n'
      + 'Переменные: <code>{streamer_name}</code>, <code>{stream_title}</code>, <code>{game_name}</code>',
  });
}
