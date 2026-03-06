/**
 * Stream offline announcement cleanup.
 *
 * Extracted from announcementService.ts to keep files under 300 lines.
 * Handles: deleting announcements after stream ends for chats with deleteAfterEnd=true.
 */

import type { MessengerProvider } from '@prisma/client';

import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

import { resolveProvider } from './resolveProvider.js';

export async function handleStreamOffline(
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
