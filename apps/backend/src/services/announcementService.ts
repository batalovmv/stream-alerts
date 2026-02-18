/**
 * Core announcement logic.
 *
 * Handles stream.online → create announcements → deliver.
 * Handles stream.offline → delete previous announcements (including disabled chats).
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { getProvider, hasProvider } from '../providers/registry.js';
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
  const { event } = payload;

  // Find streamer by MemeLab channel ID
  const streamer = await prisma.streamer.findUnique({
    where: { memelabChannelId: payload.channelId },
    include: {
      // For online: only enabled chats
      // For offline: we re-query to include all chats with deleteAfterEnd
      chats: { where: { enabled: true } },
    },
  });

  if (!streamer) {
    logger.info({ channelId: payload.channelId }, 'announce.no_streamer');
    return;
  }

  if (event === 'stream.online') {
    if (streamer.chats.length === 0) {
      logger.info({ streamerId: streamer.id }, 'announce.no_chats');
      return;
    }
    await handleStreamOnline(streamer, payload);
  } else {
    await handleStreamOffline(streamer.id);
  }
}

// ─── Stream Online ────────────────────────────────────────

async function handleStreamOnline(
  streamer: { id: string; displayName: string; twitchLogin: string | null; defaultTemplate: string | null; telegramUserId: string | null; chats: Array<{ id: string; provider: string; chatId: string; chatTitle: string | null; customTemplate: string | null }> },
  payload: StreamEventPayload,
): Promise<void> {
  // Stable session ID: channelId + startedAt (required for dedup)
  const streamSessionId = payload.channelId + ':' + (payload.startedAt ?? 'unknown');

  const templateVars = {
    streamer_name: streamer.displayName,
    stream_title: payload.streamTitle,
    game_name: payload.gameName,
    stream_url: streamer.twitchLogin ? `https://twitch.tv/${streamer.twitchLogin}` : undefined,
    memelab_url: `https://memelab.ru/${payload.channelSlug}`,
  };

  const buttons = buildDefaultButtons(templateVars);

  const results: Array<{ chatTitle: string; ok: boolean }> = [];

  for (const chat of streamer.chats) {
    const title = chat.chatTitle ?? chat.chatId;
    try {
      const template = chat.customTemplate || streamer.defaultTemplate;
      const text = renderTemplate(template, templateVars);
      const provider = getProvider(chat.provider);

      // Check if already sent for this stream session
      const existing = await prisma.announcementLog.findFirst({
        where: {
          chatId: chat.id,
          streamSessionId,
          status: 'sent',
        },
      });

      if (existing?.providerMsgId) {
        // Update existing announcement (title/game changed)
        await provider.editAnnouncement(chat.chatId, existing.providerMsgId, {
          text,
          photoUrl: payload.thumbnailUrl,
          buttons,
        });
        logger.info({ chatId: chat.chatId, streamSessionId, messageId: existing.providerMsgId }, 'announce.updated');
        results.push({ chatTitle: title, ok: true });
        continue;
      }

      if (existing) {
        logger.info({ chatId: chat.chatId, streamSessionId }, 'announce.dedup_skipped');
        continue;
      }

      // Atomic dedup lock: prevent concurrent workers from sending to the same chat+session
      const lockKey = `announce:lock:${chat.id}:${streamSessionId}`;
      const acquired = await redis.set(lockKey, '1', 'EX', 300, 'NX');
      if (!acquired) {
        logger.info({ chatId: chat.chatId, streamSessionId }, 'announce.dedup_locked');
        continue;
      }

      const result = await provider.sendAnnouncement(chat.chatId, {
        text,
        photoUrl: payload.thumbnailUrl,
        buttons,
      });

      await prisma.announcementLog.create({
        data: {
          chatId: chat.id,
          streamSessionId,
          provider: chat.provider as 'telegram' | 'max',
          providerMsgId: result.messageId,
          status: 'sent',
          sentAt: new Date(),
        },
      });

      await prisma.connectedChat.update({
        where: { id: chat.id },
        data: {
          lastMessageId: result.messageId,
          lastAnnouncedAt: new Date(),
        },
      });

      logger.info({ chatId: chat.chatId, provider: chat.provider, messageId: result.messageId }, 'announce.sent');
      results.push({ chatTitle: title, ok: true });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ chatId: chat.chatId, provider: chat.provider, error: errMsg }, 'announce.send_failed');

      // Auto-disable chat on permanent provider errors (bot blocked, chat deleted, etc.)
      if (error instanceof Error && 'permanent' in error && (error as { permanent: boolean }).permanent) {
        await prisma.connectedChat.update({
          where: { id: chat.id },
          data: { enabled: false },
        });
        logger.warn({ chatId: chat.chatId, provider: chat.provider }, 'announce.chat_disabled_permanent_error');
      }

      await prisma.announcementLog.create({
        data: {
          chatId: chat.id,
          streamSessionId,
          provider: chat.provider as 'telegram' | 'max',
          status: 'failed',
          error: errMsg,
        },
      });

      results.push({ chatTitle: title, ok: false });
    }
  }

  // Notify streamer about delivery results via Telegram (if linked and provider available)
  if (streamer.telegramUserId && results.length > 0 && hasProvider('telegram')) {
    try {
      const tgProvider = getProvider('telegram');
      const lines = results.map((r) => `${r.ok ? '\u2705' : '\u274C'} ${r.chatTitle}`);
      await tgProvider.sendAnnouncement(streamer.telegramUserId, {
        text: `\uD83D\uDCE2 Анонс стрима:\n\n${lines.join('\n')}`,
      });
    } catch {
      // Don't fail the whole flow if notification to streamer fails
    }
  }
}

// ─── Stream Offline ───────────────────────────────────────

async function handleStreamOffline(streamerId: string): Promise<void> {
  // Query ALL chats with deleteAfterEnd=true, regardless of enabled status,
  // so previously-sent announcements are cleaned up even if the chat was disabled mid-stream.
  const chats = await prisma.connectedChat.findMany({
    where: {
      streamerId,
      deleteAfterEnd: true,
    },
  });

  for (const chat of chats) {
    try {
      // Use lastMessageId if available, otherwise fall back to AnnouncementLog
      let messageIdToDelete = chat.lastMessageId;
      if (!messageIdToDelete) {
        // Fallback: find the most recent UNSENT-deleted announcement for this chat,
        // but only consider recent ones (last 24h) to avoid deleting announcements
        // from a subsequent stream session
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const logEntry = await prisma.announcementLog.findFirst({
          where: { chatId: chat.id, status: 'sent', sentAt: { gte: cutoff } },
          orderBy: { sentAt: 'desc' },
        });
        messageIdToDelete = logEntry?.providerMsgId ?? null;
      }

      if (!messageIdToDelete) continue;

      const provider = getProvider(chat.provider);
      await provider.deleteMessage(chat.chatId, messageIdToDelete);

      // Update announcement log
      await prisma.announcementLog.updateMany({
        where: {
          chatId: chat.id,
          providerMsgId: messageIdToDelete,
          status: 'sent',
        },
        data: {
          status: 'deleted',
          deletedAt: new Date(),
        },
      });

      // Clear last message ID
      if (chat.lastMessageId) {
        await prisma.connectedChat.update({
          where: { id: chat.id },
          data: { lastMessageId: null },
        });
      }

      logger.info({ chatId: chat.chatId, provider: chat.provider }, 'announce.deleted_after_offline');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ chatId: chat.chatId, provider: chat.provider, error: errMsg }, 'announce.delete_failed');
    }
  }
}
