/**
 * Settings template editing handlers.
 *
 * Extracted from settings.ts to keep files under 300 lines.
 * Handles: template edit session (Redis pending state), text input, reset.
 */

import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { parseStreamPlatforms, parseCustomButtons } from '../../lib/streamPlatforms.js';
import * as tg from '../../providers/telegram/telegramApi.js';
import {
  renderTemplate,
  buildButtons,
  buildTemplateVars,
  TEMPLATE_VARIABLE_DOCS,
} from '../../services/templateService.js';
import type { CallbackContext } from '../types.js';
import { BACK_TO_MENU_ROW } from '../ui.js';

const PENDING_TEMPLATE_PREFIX = 'pending:template:';
const PENDING_TEMPLATE_TTL = 300; // 5 minutes

export async function getPendingTemplateEdit(userId: number): Promise<string | undefined> {
  const val = await redis.get(PENDING_TEMPLATE_PREFIX + userId);
  return val ?? undefined;
}

export async function clearPendingTemplateEdit(userId: number): Promise<void> {
  await redis.del(PENDING_TEMPLATE_PREFIX + userId);
}

export async function handleSettingsTemplate(
  ctx: CallbackContext,
  chatDbId: string,
): Promise<void> {
  // Verify ownership before storing pending edit state
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

  await redis.setex(PENDING_TEMPLATE_PREFIX + ctx.userId, PENDING_TEMPLATE_TTL, chatDbId);

  const varsList = TEMPLATE_VARIABLE_DOCS.map(
    (v) => `<code>{${v.name}}</code> — ${v.description}`,
  ).join('\n');

  await tg.answerCallbackQuery({ callbackQueryId: ctx.callbackQueryId });
  await tg.sendMessage({
    chatId: String(ctx.chatId),
    text:
      '📝 Отправьте новый шаблон анонса.\n\n' +
      `Переменные:\n${varsList}\n\n` +
      '<code>reset</code> — сбросить на стандартный\n' +
      '/cancel — отмена',
  });
}

export async function handleTemplateTextInput(
  chatId: number,
  userId: number,
  text: string,
  pendingChatDbId?: string,
): Promise<void> {
  const chatDbId = pendingChatDbId ?? (await redis.get(PENDING_TEMPLATE_PREFIX + userId));
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
    // Don't consume the pending key — user can retry after the issue resolves
    await tg.sendMessage({
      chatId: String(chatId),
      text: '\u{274C} Канал не найден или не принадлежит вашему аккаунту.',
    });
    return;
  }

  // Validate template length (same limit as REST API)
  const MAX_TEMPLATE_LENGTH = 2000;
  if (text.length > MAX_TEMPLATE_LENGTH) {
    // Restore pending state so user can retry with shorter text
    await redis.setex(PENDING_TEMPLATE_PREFIX + userId, PENDING_TEMPLATE_TTL, chatDbId);
    await tg.sendMessage({
      chatId: String(chatId),
      text: `\u{274C} Шаблон слишком длинный (${text.length}/${MAX_TEMPLATE_LENGTH}). Сократите и отправьте снова.`,
    });
    return;
  }

  if (text.toLowerCase() === 'reset') {
    await prisma.connectedChat.update({
      where: { id: chatDbId, streamerId: streamer.id },
      data: { customTemplate: null },
    });
    // Consume pending key only after DB write succeeds (user can retry on failure)
    await redis.del(PENDING_TEMPLATE_PREFIX + userId);
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
  // Consume pending key only after DB write succeeds (user can retry on failure)
  await redis.del(PENDING_TEMPLATE_PREFIX + userId);

  // Auto-preview the saved template
  const platforms = parseStreamPlatforms(streamer.streamPlatforms);
  const customButtons = parseCustomButtons(streamer.customButtons);

  const previewVars = buildTemplateVars({
    displayName: streamer.displayName,
    platforms,
    channelSlug: streamer.channelSlug || streamer.memelabChannelId,
    twitchLogin: streamer.twitchLogin,
    streamTitle: 'Играем в новый инди-хоррор!',
    gameName: 'Phasmophobia',
    startedAt: new Date().toISOString(),
  });
  const previewText = renderTemplate(text, previewVars);
  const buttons = buildButtons(previewVars, customButtons);
  await tg.sendMessage({
    chatId: String(chatId),
    text: `\u{2705} Шаблон обновлён!\n\n${previewText}`,
    buttons: buttons.map((b) => ({ label: b.label, url: b.url })),
  });
}
