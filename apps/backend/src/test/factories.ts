/**
 * Shared test factories for MemeLab Notify backend.
 *
 * Usage:
 *   import { makeStreamer, makeChat, makeFakeProvider } from '../test/factories.js';
 *   const streamer = makeStreamer({ displayName: 'Custom' });
 */
import type { Request, Response, NextFunction } from 'express';
import { vi } from 'vitest';

// ─── Streamer ──────────────────────────────────────────

export function makeStreamer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'streamer-1',
    memelabUserId: 'ml-user-1',
    memelabChannelId: 'ml-chan-1',
    channelSlug: 'test-streamer',
    twitchLogin: 'teststreamer',
    displayName: 'TestStreamer',
    avatarUrl: null,
    defaultTemplate: null,
    streamPlatforms: null,
    customButtons: null,
    photoType: 'stream_preview',
    customBotToken: null,
    customBotUsername: null,
    telegramUserId: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    chats: [],
    ...overrides,
  };
}

// ─── ConnectedChat ─────────────────────────────────────

export function makeChat(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chat-1',
    streamerId: 'streamer-1',
    provider: 'telegram' as const,
    chatId: '-1001234567890',
    chatTitle: 'Test Channel',
    chatType: 'supergroup',
    enabled: true,
    deleteAfterEnd: false,
    customTemplate: null,
    lastMessageId: null,
    lastAnnouncedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─── AnnouncementLog ───────────────────────────────────

export function makeAnnouncementLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    chatId: 'chat-1',
    streamSessionId: 'session-1',
    provider: 'telegram' as const,
    providerMsgId: 'msg-1',
    status: 'sent' as const,
    error: null,
    attempts: 1,
    queuedAt: new Date('2025-01-01'),
    sentAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

// ─── Messenger Provider ────────────────────────────────

export function makeFakeProvider(overrides: Record<string, unknown> = {}) {
  return {
    name: 'telegram',
    validateBotAccess: vi.fn().mockResolvedValue(true),
    getChatInfo: vi.fn().mockResolvedValue({ title: 'Test Chat', type: 'supergroup' }),
    sendAnnouncement: vi.fn().mockResolvedValue({ messageId: 'msg-42' }),
    editAnnouncement: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Express Request/Response ──────────────────────────

export function createMockReqRes(overrides: Record<string, unknown> = {}): {
  req: Request;
  res: Response;
  next: NextFunction;
} {
  const req = {
    streamer: makeStreamer(),
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next };
}

// ─── Stream Event Payloads ─────────────────────────────

export function onlinePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'stream.online' as const,
    channelId: 'ml-chan-1',
    channelSlug: 'test-streamer',
    twitchLogin: 'teststreamer',
    streamTitle: 'Test Stream',
    gameName: 'Just Chatting',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function offlinePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'stream.offline' as const,
    channelId: 'ml-chan-1',
    channelSlug: 'test-streamer',
    twitchLogin: 'teststreamer',
    ...overrides,
  };
}

// ─── Frontend-style JSON response helper ───────────────

export function jsonResponse(body: unknown, status = 200): globalThis.Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
