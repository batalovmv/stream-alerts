/**
 * Core announcement logic.
 *
 * Handles stream.online → create announcements → deliver (see announcementDelivery.ts).
 * Handles stream.update → edit existing announcements.
 * Handles stream.offline → delete previous announcements (including disabled chats).
 */

import type { MessengerProvider, PhotoType } from '@prisma/client';

import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { resolveProvider } from '../lib/resolveProvider.js';
import { parseStreamPlatforms, parseCustomButtons } from '../lib/streamPlatforms.js';

import { handleStreamOnline } from './announcementDelivery.js';
import { renderTemplate, buildButtons, buildTemplateVars } from './templateService.js';

/** Allowed hosts for thumbnail URLs to prevent SSRF via Telegram fetch */
const ALLOWED_THUMBNAIL_HOSTS = new Set([
  'static-cdn.jtvnw.net', // Twitch CDN
  'i.ytimg.com', // YouTube thumbnails
  'memelab.ru',
]);

/** Validate and sanitize thumbnailUrl — only allow known CDN hosts */
function sanitizeThumbnailUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    // Replace Twitch thumbnail placeholders with actual dimensions
    const resolved = url.replace('{width}', '1280').replace('{height}', '720');
    const parsed = new URL(resolved);
    if (parsed.protocol !== 'https:') return undefined;
    if (!ALLOWED_THUMBNAIL_HOSTS.has(parsed.hostname)) {
      logger.warn({ thumbnailUrl: resolved, host: parsed.hostname }, 'announce.thumbnail_blocked');
      return undefined;
    }
    return resolved;
  } catch {
    return undefined;
  }
}

/** Resolve the photo URL based on streamer's photoType preference */
export function resolvePhotoUrl(
  photoType: PhotoType,
  thumbnailUrl: string | undefined,
  _gameName: string | undefined,
): string | undefined {
  switch (photoType) {
    case 'stream_preview':
      return sanitizeThumbnailUrl(thumbnailUrl);
    case 'game_box_art':
      // Temporarily disabled — Twitch box art CDN returns placeholders for
      // non-Twitch platforms or missing gameName. Fall back to stream preview.
      return sanitizeThumbnailUrl(thumbnailUrl);
    case 'none':
      return undefined;
    default:
      return sanitizeThumbnailUrl(thumbnailUrl);
  }
}

interface StreamEventBase {
  channelId: string;
  channelSlug: string;
  twitchLogin?: string;
  streamTitle?: string;
  gameName?: string;
  thumbnailUrl?: string;
  viewerCount?: number;
}

interface StreamOnlinePayload extends StreamEventBase {
  event: 'stream.online';
  startedAt: string; // Required — used for dedup jobId and streamSessionId
}

interface StreamOfflinePayload extends StreamEventBase {
  event: 'stream.offline';
  startedAt?: string;
}

interface StreamUpdatePayload extends StreamEventBase {
  event: 'stream.update';
  startedAt?: string;
}

export type StreamEventPayload = StreamOnlinePayload | StreamOfflinePayload | StreamUpdatePayload;
export type { StreamOnlinePayload, StreamOfflinePayload, StreamUpdatePayload };

/**
 * Build a deterministic stream session ID.
 *
 * For stream.online: startedAt is always provided (enforced by Zod schema).
 * For stream.offline/update: uses Redis-stored session from the online event.
 * The fallback exists only for edge cases (e.g., Redis restart during offline).
 */
function buildStreamSessionId(channelId: string, startedAt?: string): string {
  if (startedAt) {
    return `${channelId}:${startedAt}`;
  }
  logger.warn({ channelId }, 'announce.build_session_no_started_at');
  return `${channelId}:no-start`;
}

/**
 * Process a stream event from MemeLab webhook.
 */
export async function processStreamEvent(
  payload: StreamEventPayload,
  jobId?: string,
): Promise<void> {
  const { event } = payload;

  // Find streamer by MemeLab channel ID
  const streamer = await prisma.streamer.findUnique({
    where: { memelabChannelId: payload.channelId },
    select: {
      id: true,
      displayName: true,
      twitchLogin: true,
      defaultTemplate: true,
      telegramUserId: true,
      streamPlatforms: true,
      customButtons: true,
      customBotToken: true,
      photoType: true,
      chats: { where: { enabled: true } },
    },
  });

  if (!streamer) {
    logger.info({ channelId: payload.channelId }, 'announce.no_streamer');
    return;
  }

  const streamSessionId = buildStreamSessionId(payload.channelId, payload.startedAt);

  if (event === 'stream.online') {
    // Store active session ID in Redis BEFORE checking chats — offline needs it
    // even if no chats are enabled now (chats may be added mid-stream)
    const sessionKey = `announce:session:${payload.channelId}`;
    await redis.set(sessionKey, streamSessionId, 'EX', 48 * 60 * 60); // 48h TTL

    if (streamer.chats.length === 0) {
      logger.info({ streamerId: streamer.id }, 'announce.no_chats');
      return;
    }
    await handleStreamOnline(streamer, payload, streamSessionId, jobId);
  } else if (event === 'stream.update') {
    // Retrieve the active session ID — must match online announcement
    const sessionKey = `announce:session:${payload.channelId}`;
    const storedSessionId = await redis.get(sessionKey);
    if (!storedSessionId) {
      logger.info({ channelId: payload.channelId }, 'announce.update_no_session');
      return;
    }
    if (streamer.chats.length === 0) {
      return;
    }
    await handleStreamUpdate(streamer, payload, storedSessionId);
  } else {
    // Retrieve the session ID stored during online — guarantees match regardless of startedAt
    const sessionKey = `announce:session:${payload.channelId}`;
    const storedSessionId = await redis.get(sessionKey);
    const effectiveSessionId = storedSessionId ?? streamSessionId;
    await handleStreamOffline(streamer.id, effectiveSessionId, streamer.customBotToken);
    // Clean up session key after successful offline processing
    await redis.del(sessionKey);
  }
}

// ─── Stream Update ────────────────────────────────────────

async function handleStreamUpdate(
  streamer: {
    id: string;
    displayName: string;
    twitchLogin: string | null;
    defaultTemplate: string | null;
    streamPlatforms: unknown;
    customButtons: unknown;
    customBotToken: string | null;
    photoType: PhotoType;
    chats: Array<{
      id: string;
      provider: string;
      chatId: string;
      chatTitle: string | null;
      customTemplate: string | null;
    }>;
  },
  payload: StreamEventPayload,
  streamSessionId: string,
): Promise<void> {
  const safePhotoUrl = resolvePhotoUrl(streamer.photoType, payload.thumbnailUrl, payload.gameName);
  logger.info(
    { photoType: streamer.photoType, gameName: payload.gameName, resolvedPhotoUrl: safePhotoUrl },
    'announce.photo_resolved',
  );

  const platforms = parseStreamPlatforms(streamer.streamPlatforms);
  const customButtons = parseCustomButtons(streamer.customButtons);

  const templateVars = buildTemplateVars({
    displayName: streamer.displayName,
    platforms,
    channelSlug: payload.channelSlug,
    twitchLogin: streamer.twitchLogin,
    streamTitle: payload.streamTitle,
    gameName: payload.gameName,
    startedAt: payload.startedAt,
    viewerCount: payload.viewerCount,
  });

  const buttons = buildButtons(templateVars, customButtons);

  // Find all sent announcements for this stream session
  const sentLogs = await prisma.announcementLog.findMany({
    where: {
      chatId: { in: streamer.chats.map((c) => c.id) },
      streamSessionId,
      status: 'sent',
      providerMsgId: { not: null },
    },
    take: 100,
  });

  if (sentLogs.length === 0) {
    logger.info({ streamerId: streamer.id, streamSessionId }, 'announce.update_no_messages');
    return;
  }

  const logByChat = new Map(sentLogs.map((log) => [log.chatId, log]));
  let transientFailures = 0;

  for (const chat of streamer.chats) {
    const log = logByChat.get(chat.id);
    if (!log?.providerMsgId) continue;

    try {
      const template = chat.customTemplate || streamer.defaultTemplate;
      const text = renderTemplate(template, templateVars);
      const provider = resolveProvider(chat.provider, streamer.customBotToken);

      await provider.editAnnouncement(chat.chatId, log.providerMsgId, {
        text,
        photoUrl: safePhotoUrl,
        buttons,
      });

      logger.info({ chatId: chat.chatId, messageId: log.providerMsgId }, 'announce.stream_updated');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isPermanent =
        error instanceof Error &&
        'permanent' in error &&
        (error as { permanent: boolean }).permanent;

      if (isPermanent) {
        // Message was deleted or bot was removed — don't fail the whole job
        logger.info(
          { chatId: chat.chatId, messageId: log.providerMsgId },
          'announce.update_skipped_message_gone',
        );
      } else {
        logger.error({ chatId: chat.chatId, error: errMsg }, 'announce.update_failed');
        transientFailures++;
      }
    }
  }

  if (transientFailures > 0) {
    throw new Error(`${transientFailures} stream update edits failed (retryable)`);
  }
}

// ─── Stream Offline ───────────────────────────────────────

async function handleStreamOffline(
  streamerId: string,
  streamSessionId: string,
  customBotToken: string | null,
): Promise<void> {
  // Query ALL chats with deleteAfterEnd=true, regardless of enabled status,
  // so previously-sent announcements are cleaned up even if the chat was disabled mid-stream.
  const chats = await prisma.connectedChat.findMany({
    where: {
      streamerId,
      deleteAfterEnd: true,
    },
    take: 100,
  });

  if (chats.length === 0) return;

  // Pre-fetch all session logs and recent logs in batch to avoid N+1 queries
  const chatIds = chats.map((c) => c.id);

  const [sessionLogs, recentLogs] = await Promise.all([
    prisma.announcementLog.findMany({
      where: { chatId: { in: chatIds }, streamSessionId, status: 'sent' },
      take: 100,
    }),
    prisma.announcementLog.findMany({
      where: {
        chatId: { in: chatIds },
        status: 'sent',
        sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { sentAt: 'desc' },
      take: 500,
    }),
  ]);

  const sessionLogByChat = new Map(sessionLogs.map((l) => [l.chatId, l]));
  const recentLogByChat = new Map<string, (typeof recentLogs)[0]>();
  for (const log of recentLogs) {
    if (!recentLogByChat.has(log.chatId)) recentLogByChat.set(log.chatId, log);
  }

  let failedCount = 0;
  const totalCount = chats.length;

  for (const chat of chats) {
    try {
      // Prefer finding the exact announcement for this stream session (from batch query)
      let messageIdToDelete: string | null = sessionLogByChat.get(chat.id)?.providerMsgId ?? null;

      // Fall back to recent log entry (24h window) — skip raw lastMessageId to avoid
      // deleting messages from a different stream session
      if (!messageIdToDelete) {
        messageIdToDelete = recentLogByChat.get(chat.id)?.providerMsgId ?? null;
      }

      if (!messageIdToDelete) continue;

      const provider = resolveProvider(chat.provider, customBotToken);
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

      logger.info(
        { chatId: chat.chatId, provider: chat.provider },
        'announce.deleted_after_offline',
      );
    } catch (error) {
      failedCount++;
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { chatId: chat.chatId, provider: chat.provider as MessengerProvider, error: errMsg },
        'announce.delete_failed',
      );
    }
  }

  // If any deletion failed, throw so BullMQ retries the job
  // (already-deleted messages are handled gracefully by providers — won't re-fail)
  if (failedCount > 0) {
    throw new Error(`${failedCount}/${totalCount} announcement deletions failed`);
  }
}
