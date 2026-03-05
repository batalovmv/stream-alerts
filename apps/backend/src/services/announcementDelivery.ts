/**
 * Stream online announcement delivery logic.
 *
 * Extracted from announcementService to keep files under 300 lines.
 * Handles: dedup locking, sending, editing, retry coordination, streamer notification.
 */

import type { MessengerProvider, PhotoType } from '@prisma/client';

import { escapeHtml } from '../lib/escapeHtml.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { resolveProvider } from '../lib/resolveProvider.js';
import { parseStreamPlatforms, parseCustomButtons } from '../lib/streamPlatforms.js';
import { getProvider, hasProvider } from '../providers/registry.js';

import type { StreamEventPayload } from './announcementService.js';
import { resolvePhotoUrl } from './announcementService.js';
import { renderTemplate, buildButtons, buildTemplateVars } from './templateService.js';

interface OnlineStreamer {
  id: string;
  displayName: string;
  twitchLogin: string | null;
  defaultTemplate: string | null;
  telegramUserId: string | null;
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
}

export async function handleStreamOnline(
  streamer: OnlineStreamer,
  payload: StreamEventPayload,
  streamSessionId: string,
  jobId?: string,
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
    take: 100,
  });
  const existingByChat = new Map(existingLogs.map((log) => [log.chatId, log]));

  const results: Array<{ chatTitle: string; ok: boolean; permanent?: boolean }> = [];

  for (const chat of streamer.chats) {
    const title = escapeHtml(chat.chatTitle ?? chat.chatId);
    const lockKey = `announce:lock:${chat.id}:${streamSessionId}`;

    // Pre-delivery validation — config errors should not create DB failure logs
    let text: string;
    let provider: ReturnType<typeof resolveProvider>;
    try {
      const template = chat.customTemplate || streamer.defaultTemplate;
      text = renderTemplate(template, templateVars);
      provider = resolveProvider(chat.provider, streamer.customBotToken);
    } catch (configError) {
      const errMsg = configError instanceof Error ? configError.message : String(configError);
      logger.error({ chatId: chat.chatId, error: errMsg }, 'announce.config_error');
      results.push({ chatTitle: title, ok: false, permanent: true });
      continue;
    }

    try {
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
          logger.info(
            { chatId: chat.chatId, streamSessionId, messageId: existing.providerMsgId },
            'announce.updated',
          );
        } catch (editError) {
          const isPermanent =
            editError instanceof Error &&
            'permanent' in editError &&
            (editError as { permanent: boolean }).permanent;
          if (isPermanent) {
            logger.info(
              { chatId: chat.chatId, messageId: existing.providerMsgId },
              'announce.edit_skipped_message_gone',
            );
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
      const lockValue = jobId ?? `fallback:${Date.now()}`;
      const LOCK_TTL_SECONDS = 120;

      // Atomic acquire-or-extend: eliminates TOCTOU between SET NX and GET.
      // Returns 'OK' if lock acquired/re-entered, or the current holder's value if blocked.
      const lockResult = (await redis.eval(
        `local cur = redis.call('GET', KEYS[1])
         if cur == false then
           redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
           return 'OK'
         elseif cur == ARGV[1] then
           redis.call('EXPIRE', KEYS[1], ARGV[2])
           return 'OK'
         else
           return cur
         end`,
        1,
        lockKey,
        lockValue,
        String(LOCK_TTL_SECONDS),
      )) as string;

      if (lockResult !== 'OK') {
        logger.info(
          { chatId: chat.chatId, streamSessionId, holder: lockResult },
          'announce.dedup_locked',
        );
        continue;
      }

      // Post-lock DB re-check: covers "send succeeded but DB write failed" phantom scenario
      const postLockCheck = await prisma.announcementLog.findFirst({
        where: { chatId: chat.id, streamSessionId, status: 'sent', providerMsgId: { not: null } },
      });

      if (postLockCheck?.providerMsgId) {
        try {
          await provider.editAnnouncement(chat.chatId, postLockCheck.providerMsgId, {
            text,
            photoUrl: safePhotoUrl,
            buttons,
          });
          logger.info(
            { chatId: chat.chatId, streamSessionId, messageId: postLockCheck.providerMsgId },
            'announce.updated_post_lock',
          );
        } catch (editError) {
          const isPermanent =
            editError instanceof Error &&
            'permanent' in editError &&
            (editError as { permanent: boolean }).permanent;
          if (!isPermanent) throw editError;
          logger.info(
            { chatId: chat.chatId, messageId: postLockCheck.providerMsgId },
            'announce.edit_skipped_message_gone',
          );
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

      // Send succeeded — DB writes must not trigger a re-send on failure
      try {
        await prisma.$transaction([
          prisma.announcementLog.create({
            data: {
              chatId: chat.id,
              streamSessionId,
              provider: chat.provider as MessengerProvider,
              providerMsgId: result.messageId,
              status: 'sent',
              sentAt: new Date(),
            },
          }),
          prisma.connectedChat.update({
            where: { id: chat.id },
            data: {
              lastMessageId: result.messageId,
              lastAnnouncedAt: new Date(),
            },
          }),
        ]);
      } catch (dbError) {
        // DB write failed AFTER successful send — log but don't retry the send
        logger.error(
          {
            chatId: chat.chatId,
            messageId: result.messageId,
            error: dbError instanceof Error ? dbError.message : String(dbError),
          },
          'announce.db_write_failed_after_send',
        );
      }

      logger.info(
        {
          chatId: chat.chatId,
          provider: chat.provider as MessengerProvider,
          messageId: result.messageId,
        },
        'announce.sent',
      );
      results.push({ chatTitle: title, ok: true });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isPermanent =
        error instanceof Error &&
        'permanent' in error &&
        (error as { permanent: boolean }).permanent;

      logger.error(
        { chatId: chat.chatId, provider: chat.provider as MessengerProvider, error: errMsg },
        'announce.send_failed',
      );

      // Auto-disable chat on permanent provider errors (bot blocked, chat deleted, etc.)
      if (isPermanent) {
        await prisma.connectedChat.update({
          where: { id: chat.id },
          data: { enabled: false },
        });
        // Release dedup lock — this chat is permanently done, no retry needed
        await redis.del(lockKey);
        logger.warn(
          { chatId: chat.chatId, provider: chat.provider },
          'announce.chat_disabled_permanent_error',
        );
      }
      // NEVER release dedup lock on transient failure — let TTL expire naturally.
      // Same job's retry re-enters via jobId match; different jobs are blocked.

      try {
        await prisma.announcementLog.create({
          data: {
            chatId: chat.id,
            streamSessionId,
            provider: chat.provider as MessengerProvider,
            status: 'failed',
            error: errMsg,
          },
        });
      } catch (dbError) {
        logger.error(
          {
            chatId: chat.chatId,
            error: dbError instanceof Error ? dbError.message : String(dbError),
          },
          'announce.failed_log_write_error',
        );
      }

      results.push({ chatTitle: title, ok: false, permanent: isPermanent });
    }
  }

  // Notify streamer about delivery results — only on first successful attempt (skip on BullMQ retries)
  const notifyKey = `announce:notified:${streamer.id}:${streamSessionId}`;
  const alreadyNotified = await redis.get(notifyKey);
  if (
    streamer.telegramUserId &&
    results.length > 0 &&
    hasProvider('telegram') &&
    !alreadyNotified
  ) {
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
    throw new Error(
      `${retryableFailures}/${results.length} announcement deliveries failed (retryable)`,
    );
  }
}
