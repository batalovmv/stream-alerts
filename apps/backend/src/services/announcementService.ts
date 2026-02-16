/**
 * Core announcement logic.
 *
 * Handles stream.online → create announcements → enqueue delivery.
 * Handles stream.offline → delete previous announcements.
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getProvider } from '../providers/registry.js';
import { renderTemplate, buildDefaultButtons } from './templateService.js';

export interface StreamEventPayload {
  event: 'stream.online' | 'stream.offline';
  channelId: string;
  channelSlug: string;
  twitchLogin: string;
  streamTitle?: string;
  gameName?: string;
  thumbnailUrl?: string;
  startedAt?: string;
}

/**
 * Process a stream event from MemeLab webhook.
 */
export async function processStreamEvent(payload: StreamEventPayload): Promise<void> {
  const { event, channelSlug } = payload;

  // Find streamer by MemeLab channel ID
  const streamer = await prisma.streamer.findUnique({
    where: { memelabChannelId: payload.channelId },
    include: {
      chats: { where: { enabled: true } },
    },
  });

  if (!streamer) {
    logger.info({ channelId: payload.channelId }, 'announce.no_streamer');
    return;
  }

  if (streamer.chats.length === 0) {
    logger.info({ streamerId: streamer.id }, 'announce.no_chats');
    return;
  }

  if (event === 'stream.online') {
    await handleStreamOnline(streamer, payload);
  } else {
    await handleStreamOffline(streamer);
  }
}

// ─── Stream Online ────────────────────────────────────────

async function handleStreamOnline(
  streamer: { id: string; displayName: string; twitchLogin: string | null; defaultTemplate: string | null; chats: Array<{ id: string; provider: string; chatId: string; customTemplate: string | null }> },
  payload: StreamEventPayload,
): Promise<void> {
  const templateVars = {
    streamer_name: streamer.displayName,
    stream_title: payload.streamTitle,
    game_name: payload.gameName,
    stream_url: streamer.twitchLogin ? `https://twitch.tv/${streamer.twitchLogin}` : undefined,
    memelab_url: `https://memelab.ru/${payload.channelSlug}`,
  };

  const buttons = buildDefaultButtons(templateVars);

  for (const chat of streamer.chats) {
    try {
      const template = chat.customTemplate || streamer.defaultTemplate;
      const text = renderTemplate(template, templateVars);

      const provider = getProvider(chat.provider);
      const result = await provider.sendAnnouncement(chat.chatId, {
        text,
        photoUrl: payload.thumbnailUrl,
        buttons,
      });

      // Save announcement log
      await prisma.announcementLog.create({
        data: {
          chatId: chat.id,
          streamSessionId: payload.channelId + ':' + (payload.startedAt ?? Date.now()),
          provider: chat.provider as 'telegram' | 'max',
          providerMsgId: result.messageId,
          status: 'sent',
          sentAt: new Date(),
        },
      });

      // Update last message ID for deletion
      await prisma.connectedChat.update({
        where: { id: chat.id },
        data: {
          lastMessageId: result.messageId,
          lastAnnouncedAt: new Date(),
        },
      });

      logger.info({ chatId: chat.chatId, provider: chat.provider, messageId: result.messageId }, 'announce.sent');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ chatId: chat.chatId, provider: chat.provider, error: errMsg }, 'announce.send_failed');

      await prisma.announcementLog.create({
        data: {
          chatId: chat.id,
          provider: chat.provider as 'telegram' | 'max',
          status: 'failed',
          error: errMsg,
        },
      });
    }
  }
}

// ─── Stream Offline ───────────────────────────────────────

async function handleStreamOffline(
  streamer: { id: string; chats: Array<{ id: string; provider: string; chatId: string; deleteAfterEnd: boolean; lastMessageId: string | null }> },
): Promise<void> {
  for (const chat of streamer.chats) {
    if (!chat.deleteAfterEnd || !chat.lastMessageId) continue;

    try {
      const provider = getProvider(chat.provider);
      await provider.deleteMessage(chat.chatId, chat.lastMessageId);

      // Update announcement log
      await prisma.announcementLog.updateMany({
        where: {
          chatId: chat.id,
          providerMsgId: chat.lastMessageId,
          status: 'sent',
        },
        data: {
          status: 'deleted',
          deletedAt: new Date(),
        },
      });

      // Clear last message ID
      await prisma.connectedChat.update({
        where: { id: chat.id },
        data: { lastMessageId: null },
      });

      logger.info({ chatId: chat.chatId, provider: chat.provider }, 'announce.deleted_after_offline');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ chatId: chat.chatId, provider: chat.provider, error: errMsg }, 'announce.delete_failed');
    }
  }
}
