/**
 * Core announcement logic.
 *
 * Handles stream.online → create announcements → deliver.
 * Handles stream.offline → delete previous announcements (including disabled chats).
 */

import type { MessengerProvider } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { getProvider, hasProvider } from '../providers/registry.js';
import { resolveProvider } from '../lib/resolveProvider.js';
import { renderTemplate, buildButtons, buildTemplateVars } from './templateService.js';
import { parseStreamPlatforms, parseCustomButtons } from '../lib/streamPlatforms.js';
import { escapeHtml } from '../lib/escapeHtml.js';

/** Allowed hosts for thumbnail URLs to prevent SSRF via Telegram fetch */
const ALLOWED_THUMBNAIL_HOSTS = new Set([
  'static-cdn.jtvnw.net',  // Twitch CDN
  'i.ytimg.com',            // YouTube thumbnails
  'memelab.ru',
]);

/** Validate and sanitize thumbnailUrl — only allow known CDN hosts */
function sanitizeThumbnailUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return undefined;
    if (!ALLOWED_THUMBNAIL_HOSTS.has(parsed.hostname)) {
      logger.warn({ thumbnailUrl: url, host: parsed.hostname }, 'announce.thumbnail_blocked');
      return undefined;
    }
    return url;
  } catch {
    return undefined;
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
export async function processStreamEvent(payload: StreamEventPayload, jobId?: string): Promise<void> {
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
    await handleStreamOffline(streamer.id, effectiveSessionId);
    // Clean up session key after successful offline processing
    await redis.del(sessionKey);
  }
}

// ─── Stream Online ────────────────────────────────────────

async function handleStreamOnline(
  streamer: { id: string; displayName: string; twitchLogin: string | null; defaultTemplate: string | null; telegramUserId: string | null; streamPlatforms: unknown; customButtons: unknown; customBotToken: string | null; chats: Array<{ id: string; provider: string; chatId: string; chatTitle: string | null; customTemplate: string | null }> },
  payload: StreamEventPayload,
  streamSessionId: string,
  jobId?: string,
): Promise<void> {
  const safePhotoUrl = sanitizeThumbnailUrl(payload.thumbnailUrl);

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
  });

  const buttons = buildButtons(templateVars, customButtons);

  // Batch dedup check: find all existing sent records for this session at once
  const chatIds = streamer.chats.map((c) => c.id);
  const existingLogs = await prisma.announcementLog.findMany({
    where: {
      chatId: { in: chatIds },
      streamSessionId,
      status: 'sent',
    },
  });
  const existingByChat = new Map(existingLogs.map((log) => [log.chatId, log]));

  const results: Array<{ chatTitle: string; ok: boolean; permanent?: boolean }> = [];

  for (const chat of streamer.chats) {
    const title = escapeHtml(chat.chatTitle ?? chat.chatId);
    try {
      const template = chat.customTemplate || streamer.defaultTemplate;
      const text = renderTemplate(template, templateVars);
      const provider = resolveProvider(chat.provider, streamer.customBotToken);

      // Check if already sent for this stream session (from batch query)
      const existing = existingByChat.get(chat.id);

      if (existing?.providerMsgId) {
        // Already sent — try to update, but treat "message not found" as OK
        // (message may have been manually deleted; that's acceptable on retry)
        try {
          await provider.editAnnouncement(chat.chatId, existing.providerMsgId, {
            text,
            photoUrl: safePhotoUrl,
            buttons,
          });
          logger.info({ chatId: chat.chatId, streamSessionId, messageId: existing.providerMsgId }, 'announce.updated');
        } catch (editError) {
          const isPermanent = editError instanceof Error && 'permanent' in editError && (editError as { permanent: boolean }).permanent;
          if (isPermanent) {
            logger.info({ chatId: chat.chatId, messageId: existing.providerMsgId }, 'announce.edit_skipped_message_gone');
          } else {
            throw editError;
          }
        }
        results.push({ chatTitle: title, ok: true });
        continue;
      }

      // Atomic dedup lock: prevent concurrent workers from sending to the same chat+session.
      // Lock value = jobId for re-entrant retries. TTL covers full BullMQ retry window
      // (3 attempts, exponential backoff 5s base → max ~15s delay + 30s processing + buffer).
      const lockKey = `announce:lock:${chat.id}:${streamSessionId}`;
      const lockValue = jobId ?? `fallback:${Date.now()}`;
      const LOCK_TTL_SECONDS = 120;

      const acquired = await redis.set(lockKey, lockValue, 'EX', LOCK_TTL_SECONDS, 'NX');
      if (!acquired) {
        // Lock exists — check if it belongs to the same job (re-entrant retry)
        const currentHolder = await redis.get(lockKey);
        if (currentHolder !== lockValue) {
          logger.info({ chatId: chat.chatId, streamSessionId, holder: currentHolder }, 'announce.dedup_locked');
          continue;
        }
        // Same job retrying — allow re-entry, refresh TTL
        await redis.expire(lockKey, LOCK_TTL_SECONDS);
      }

      // Post-lock DB re-check: covers "send succeeded but DB write failed" phantom scenario
      const postLockCheck = await prisma.announcementLog.findFirst({
        where: { chatId: chat.id, streamSessionId, status: 'sent', providerMsgId: { not: null } },
      });

      if (postLockCheck?.providerMsgId) {
        try {
          await provider.editAnnouncement(chat.chatId, postLockCheck.providerMsgId, {
            text, photoUrl: safePhotoUrl, buttons,
          });
          logger.info({ chatId: chat.chatId, streamSessionId, messageId: postLockCheck.providerMsgId }, 'announce.updated_post_lock');
        } catch (editError) {
          const isPermanent = editError instanceof Error && 'permanent' in editError && (editError as { permanent: boolean }).permanent;
          if (!isPermanent) throw editError;
          logger.info({ chatId: chat.chatId, messageId: postLockCheck.providerMsgId }, 'announce.edit_skipped_message_gone');
        }
        results.push({ chatTitle: title, ok: true });
        continue;
      }

      // Clean up stale record AFTER acquiring lock (prevents race with concurrent workers)
      if (existing) {
        await prisma.announcementLog.delete({ where: { id: existing.id } });
        logger.warn({ chatId: chat.chatId, streamSessionId }, 'announce.stale_record_cleaned');
      }

      const result = await provider.sendAnnouncement(chat.chatId, {
        text,
        photoUrl: safePhotoUrl,
        buttons,
      });

      await prisma.announcementLog.create({
        data: {
          chatId: chat.id,
          streamSessionId,
          provider: chat.provider as MessengerProvider,
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

      logger.info({ chatId: chat.chatId, provider: chat.provider as MessengerProvider, messageId: result.messageId }, 'announce.sent');
      results.push({ chatTitle: title, ok: true });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isPermanent = error instanceof Error && 'permanent' in error && (error as { permanent: boolean }).permanent;

      logger.error({ chatId: chat.chatId, provider: chat.provider as MessengerProvider, error: errMsg }, 'announce.send_failed');

      // Auto-disable chat on permanent provider errors (bot blocked, chat deleted, etc.)
      if (isPermanent) {
        await prisma.connectedChat.update({
          where: { id: chat.id },
          data: { enabled: false },
        });
        logger.warn({ chatId: chat.chatId, provider: chat.provider }, 'announce.chat_disabled_permanent_error');
      }
      // NEVER release dedup lock on transient failure — let TTL expire naturally.
      // Same job's retry re-enters via jobId match; different jobs are blocked.

      await prisma.announcementLog.create({
        data: {
          chatId: chat.id,
          streamSessionId,
          provider: chat.provider as MessengerProvider,
          status: 'failed',
          error: errMsg,
        },
      });

      results.push({ chatTitle: title, ok: false, permanent: isPermanent });
    }
  }

  // Notify streamer about delivery results — only on first successful attempt (skip on BullMQ retries)
  const notifyKey = `announce:notified:${streamer.id}:${streamSessionId}`;
  const alreadyNotified = await redis.get(notifyKey);
  if (streamer.telegramUserId && results.length > 0 && hasProvider('telegram') && !alreadyNotified) {
    try {
      const tgProvider = getProvider('telegram');
      const lines = results.map((r) => `${r.ok ? '\u2705' : '\u274C'} ${r.chatTitle}`);
      await tgProvider.sendAnnouncement(streamer.telegramUserId, {
        text: `\uD83D\uDCE2 Анонс стрима:\n\n${lines.join('\n')}`,
      });
      await redis.set(notifyKey, '1', 'EX', 48 * 60 * 60);
    } catch {
      // Don't fail the whole flow if notification to streamer fails
    }
  }

  // Count transient (retryable) failures — permanent failures are handled (chat disabled)
  const retryableFailures = results.filter((r) => !r.ok && !r.permanent).length;
  if (retryableFailures > 0) {
    throw new Error(`${retryableFailures}/${results.length} announcement deliveries failed (retryable)`);
  }
}

// ─── Stream Update ────────────────────────────────────────

async function handleStreamUpdate(
  streamer: { id: string; displayName: string; twitchLogin: string | null; defaultTemplate: string | null; streamPlatforms: unknown; customButtons: unknown; customBotToken: string | null; chats: Array<{ id: string; provider: string; chatId: string; chatTitle: string | null; customTemplate: string | null }> },
  payload: StreamEventPayload,
  streamSessionId: string,
): Promise<void> {
  const safePhotoUrl = sanitizeThumbnailUrl(payload.thumbnailUrl);

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
  });

  if (sentLogs.length === 0) {
    logger.info({ streamerId: streamer.id, streamSessionId }, 'announce.update_no_messages');
    return;
  }

  const logByChat = new Map(sentLogs.map((log) => [log.chatId, log]));

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
      const isPermanent = error instanceof Error && 'permanent' in error && (error as { permanent: boolean }).permanent;

      if (isPermanent) {
        // Message was deleted or bot was removed — don't fail the whole job
        logger.info({ chatId: chat.chatId, messageId: log.providerMsgId }, 'announce.update_skipped_message_gone');
      } else {
        logger.error({ chatId: chat.chatId, error: errMsg }, 'announce.update_failed');
      }
    }
  }
}

// ─── Stream Offline ───────────────────────────────────────

async function handleStreamOffline(streamerId: string, streamSessionId: string): Promise<void> {
  // Query ALL chats with deleteAfterEnd=true, regardless of enabled status,
  // so previously-sent announcements are cleaned up even if the chat was disabled mid-stream.
  const chats = await prisma.connectedChat.findMany({
    where: {
      streamerId,
      deleteAfterEnd: true,
    },
  });

  // Load streamer's custom bot token for deletion (messages were sent by this bot)
  const streamer = await prisma.streamer.findUnique({
    where: { id: streamerId },
    select: { customBotToken: true },
  });

  // Pre-fetch all session logs and recent logs in batch to avoid N+1 queries
  const chatIds = chats.map((c) => c.id);

  const [sessionLogs, recentLogs] = await Promise.all([
    prisma.announcementLog.findMany({
      where: { chatId: { in: chatIds }, streamSessionId, status: 'sent' },
    }),
    prisma.announcementLog.findMany({
      where: { chatId: { in: chatIds }, status: 'sent', sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { sentAt: 'desc' },
    }),
  ]);

  const sessionLogByChat = new Map(sessionLogs.map((l) => [l.chatId, l]));
  const recentLogByChat = new Map<string, typeof recentLogs[0]>();
  for (const log of recentLogs) {
    if (!recentLogByChat.has(log.chatId)) recentLogByChat.set(log.chatId, log);
  }

  let failedCount = 0;
  const totalCount = chats.length;

  for (const chat of chats) {
    try {
      // Prefer finding the exact announcement for this stream session (from batch query)
      let messageIdToDelete: string | null = sessionLogByChat.get(chat.id)?.providerMsgId ?? null;

      // Fall back to lastMessageId or recent log entry
      if (!messageIdToDelete) {
        messageIdToDelete = chat.lastMessageId;
      }
      if (!messageIdToDelete) {
        messageIdToDelete = recentLogByChat.get(chat.id)?.providerMsgId ?? null;
      }

      if (!messageIdToDelete) continue;

      const provider = resolveProvider(chat.provider, streamer?.customBotToken);
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
      failedCount++;
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ chatId: chat.chatId, provider: chat.provider as MessengerProvider, error: errMsg }, 'announce.delete_failed');
    }
  }

  // If any deletion failed, throw so BullMQ retries the job
  // (already-deleted messages are handled gracefully by providers — won't re-fail)
  if (failedCount > 0) {
    throw new Error(`${failedCount}/${totalCount} announcement deletions failed`);
  }
}
