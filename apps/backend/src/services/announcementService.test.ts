/**
 * Tests for announcementService — core announcement delivery logic.
 *
 * Mock strategy:
 * - prisma: vi.mock('../lib/prisma.js') with deep partial stubs
 * - redis: vi.mock('../lib/redis.js') with method stubs
 * - resolveProvider / registry: vi.mock so every chat gets a fake MessengerProvider
 * - templateService: vi.mock with passthrough-like stubs (not testing rendering here)
 * - streamPlatforms: vi.mock returning neutral defaults
 * - logger: vi.mock (silent)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────

// Prisma mock
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn((args: unknown[]) => Promise.all(args)),
    streamer: { findUnique: vi.fn() },
    connectedChat: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    announcementLog: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Redis mock
vi.mock('../lib/redis.js', () => ({
  redis: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    expire: vi.fn(),
  },
}));

// Provider registry mock
vi.mock('../providers/registry.js', () => ({
  getProvider: vi.fn(),
  hasProvider: vi.fn(),
}));

// resolveProvider — returns the fake provider we control per-test
const mockProvider: {
  sendAnnouncement: Mock;
  editAnnouncement: Mock;
  deleteMessage: Mock;
  getChatInfo: Mock;
  validateBotAccess: Mock;
  name: string;
} = {
  name: 'telegram',
  sendAnnouncement: vi.fn(),
  editAnnouncement: vi.fn(),
  deleteMessage: vi.fn(),
  getChatInfo: vi.fn(),
  validateBotAccess: vi.fn(),
};

vi.mock('../lib/resolveProvider.js', () => ({
  resolveProvider: vi.fn(() => mockProvider),
}));

// Template service — passthrough stubs
vi.mock('./templateService.js', () => ({
  renderTemplate: vi.fn((_tpl: unknown, _vars: unknown) => '<b>Stream is live!</b>'),
  buildButtons: vi.fn(() => [{ label: 'Watch', url: 'https://twitch.tv/test' }]),
  buildTemplateVars: vi.fn(() => ({ streamer_name: 'TestStreamer' })),
}));

// Stream platforms — neutral defaults
vi.mock('../lib/streamPlatforms.js', () => ({
  parseStreamPlatforms: vi.fn(() => []),
  parseCustomButtons: vi.fn(() => null),
}));

// Logger — silent
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// escapeHtml — passthrough
vi.mock('../lib/escapeHtml.js', () => ({
  escapeHtml: vi.fn((s: string) => s),
}));

// ─── Imports (after mocks) ───────────────────────────────────

import { processStreamEvent, type StreamEventPayload } from './announcementService.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { getProvider, hasProvider } from '../providers/registry.js';

// ─── Helpers ─────────────────────────────────────────────────

/** Build a minimal streamer object with sensible defaults. */
function makeStreamer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'streamer-1',
    displayName: 'TestStreamer',
    twitchLogin: 'teststreamer',
    defaultTemplate: null,
    telegramUserId: null,
    streamPlatforms: [],
    customButtons: null,
    customBotToken: null,
    chats: [makeChat()],
    ...overrides,
  };
}

/** Build a minimal connected chat. */
function makeChat(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chat-1',
    provider: 'telegram',
    chatId: '-1001234567890',
    chatTitle: 'Test Channel',
    customTemplate: null,
    enabled: true,
    deleteAfterEnd: false,
    lastMessageId: null,
    lastAnnouncedAt: null,
    streamerId: 'streamer-1',
    ...overrides,
  };
}

/** Build a stream.online payload. */
function onlinePayload(overrides: Record<string, unknown> = {}): StreamEventPayload {
  return {
    event: 'stream.online',
    channelId: 'ch-1',
    channelSlug: 'test-channel',
    twitchLogin: 'teststreamer',
    streamTitle: 'Playing Dota 2',
    gameName: 'Dota 2',
    startedAt: '2026-02-24T12:00:00Z',
    ...overrides,
  } as StreamEventPayload;
}

/** Build a stream.offline payload. */
function offlinePayload(overrides: Record<string, unknown> = {}): StreamEventPayload {
  return {
    event: 'stream.offline',
    channelId: 'ch-1',
    channelSlug: 'test-channel',
    ...overrides,
  } as StreamEventPayload;
}

/** Build a stream.update payload. */
function updatePayload(overrides: Record<string, unknown> = {}): StreamEventPayload {
  return {
    event: 'stream.update',
    channelId: 'ch-1',
    channelSlug: 'test-channel',
    streamTitle: 'Now playing CS2',
    gameName: 'CS2',
    viewerCount: 150,
    ...overrides,
  } as StreamEventPayload;
}

/** Create a permanent provider error (with .permanent = true). */
function permanentError(msg = 'Forbidden: bot was blocked by the user'): Error & { permanent: boolean } {
  const err = new Error(msg) as Error & { permanent: boolean };
  err.permanent = true;
  return err;
}

/** Create a transient provider error. */
function transientError(msg = 'Request timeout'): Error {
  return new Error(msg);
}

// ─── Reset ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: Redis set succeeds (lock acquired), get returns null
  (redis.set as Mock).mockResolvedValue('OK');
  (redis.get as Mock).mockResolvedValue(null);
  (redis.del as Mock).mockResolvedValue(1);
  (redis.expire as Mock).mockResolvedValue(1);

  // Default: no existing announcement logs
  (prisma.announcementLog.findMany as Mock).mockResolvedValue([]);
  (prisma.announcementLog.findFirst as Mock).mockResolvedValue(null);
  (prisma.announcementLog.create as Mock).mockResolvedValue({ id: 'log-1' });
  (prisma.announcementLog.delete as Mock).mockResolvedValue({ id: 'log-1' });
  (prisma.announcementLog.updateMany as Mock).mockResolvedValue({ count: 1 });

  (prisma.connectedChat.update as Mock).mockResolvedValue({});
  (prisma.connectedChat.findMany as Mock).mockResolvedValue([]);

  // Default: provider succeeds
  mockProvider.sendAnnouncement.mockResolvedValue({ messageId: 'msg-100' });
  mockProvider.editAnnouncement.mockResolvedValue(undefined);
  mockProvider.deleteMessage.mockResolvedValue(undefined);

  // Registry helpers
  (hasProvider as Mock).mockReturnValue(false);
  (getProvider as Mock).mockReturnValue(mockProvider);
});

// ═════════════════════════════════════════════════════════════
// 1. processStreamEvent — routing
// ═════════════════════════════════════════════════════════════

describe('processStreamEvent routing', () => {
  it('returns early when streamer is not found in DB', async () => {
    (prisma.streamer.findUnique as Mock).mockResolvedValue(null);

    await processStreamEvent(onlinePayload());

    expect(prisma.streamer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memelabChannelId: 'ch-1' } }),
    );
    // No provider calls
    expect(mockProvider.sendAnnouncement).not.toHaveBeenCalled();
  });

  it('dispatches stream.online to handleStreamOnline', async () => {
    const streamer = makeStreamer();
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);

    await processStreamEvent(onlinePayload(), 'job-1');

    // Session key stored in Redis
    expect(redis.set).toHaveBeenCalledWith(
      'announce:session:ch-1',
      'ch-1:2026-02-24T12:00:00Z',
      'EX',
      48 * 60 * 60,
    );
    // Provider was called to send
    expect(mockProvider.sendAnnouncement).toHaveBeenCalled();
  });

  it('stores session key even when no enabled chats (online)', async () => {
    const streamer = makeStreamer({ chats: [] });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);

    await processStreamEvent(onlinePayload());

    // Session key IS set (needed by offline even if no chats now)
    expect(redis.set).toHaveBeenCalledWith(
      'announce:session:ch-1',
      expect.any(String),
      'EX',
      expect.any(Number),
    );
    // But no send attempted
    expect(mockProvider.sendAnnouncement).not.toHaveBeenCalled();
  });

  it('dispatches stream.offline to handleStreamOffline and cleans session key', async () => {
    const streamer = makeStreamer({ chats: [] });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (redis.get as Mock).mockResolvedValue('ch-1:2026-02-24T12:00:00Z');

    await processStreamEvent(offlinePayload());

    // Session key deleted
    expect(redis.del).toHaveBeenCalledWith('announce:session:ch-1');
  });

  it('dispatches stream.update using stored session ID', async () => {
    const streamer = makeStreamer();
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (redis.get as Mock).mockResolvedValue('ch-1:2026-02-24T12:00:00Z');

    // For update: no sent logs → early return within handleStreamUpdate
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([]);

    await processStreamEvent(updatePayload());

    // Redis was queried for stored session
    expect(redis.get).toHaveBeenCalledWith('announce:session:ch-1');
  });

  it('returns early for stream.update when no stored session', async () => {
    const streamer = makeStreamer();
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (redis.get as Mock).mockResolvedValue(null);

    await processStreamEvent(updatePayload());

    // No edit attempted — no session means no prior online announcement
    expect(mockProvider.editAnnouncement).not.toHaveBeenCalled();
  });

  it('uses fallback sessionId for offline when Redis has no stored session', async () => {
    const streamer = makeStreamer({ chats: [] });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (redis.get as Mock).mockResolvedValue(null);

    await processStreamEvent(offlinePayload());

    // Should still proceed (with fallback ID) and clean up
    expect(redis.del).toHaveBeenCalledWith('announce:session:ch-1');
  });
});

// ═════════════════════════════════════════════════════════════
// 2. handleStreamOnline — dedup logic
// ═════════════════════════════════════════════════════════════

describe('handleStreamOnline dedup logic', () => {
  beforeEach(() => {
    const streamer = makeStreamer();
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
  });

  // --- Already-sent (edit path) ---

  it('edits existing message when dedup check finds a sent record', async () => {
    const existingLog = {
      id: 'log-existing',
      chatId: 'chat-1',
      streamSessionId: 'ch-1:2026-02-24T12:00:00Z',
      providerMsgId: 'msg-50',
      status: 'sent',
    };
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([existingLog]);

    await processStreamEvent(onlinePayload(), 'job-1');

    // Should edit, NOT send new
    expect(mockProvider.editAnnouncement).toHaveBeenCalledWith(
      '-1001234567890',
      'msg-50',
      expect.objectContaining({ text: expect.any(String) }),
    );
    expect(mockProvider.sendAnnouncement).not.toHaveBeenCalled();
    // No new log created
    expect(prisma.announcementLog.create).not.toHaveBeenCalled();
  });

  it('skips silently when edit fails with permanent error (message deleted externally)', async () => {
    const existingLog = {
      id: 'log-existing',
      chatId: 'chat-1',
      streamSessionId: 'ch-1:2026-02-24T12:00:00Z',
      providerMsgId: 'msg-50',
      status: 'sent',
    };
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([existingLog]);
    mockProvider.editAnnouncement.mockRejectedValue(permanentError('message not found'));

    // Should NOT throw — permanent edit failure on existing message is acceptable
    await processStreamEvent(onlinePayload(), 'job-1');

    expect(mockProvider.sendAnnouncement).not.toHaveBeenCalled();
  });

  it('throws when edit fails with transient error on existing message', async () => {
    const existingLog = {
      id: 'log-existing',
      chatId: 'chat-1',
      streamSessionId: 'ch-1:2026-02-24T12:00:00Z',
      providerMsgId: 'msg-50',
      status: 'sent',
    };
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([existingLog]);
    mockProvider.editAnnouncement.mockRejectedValue(transientError('timeout'));

    // Transient edit error → caught by outer catch → creates failed log → throws retryable
    await expect(processStreamEvent(onlinePayload(), 'job-1')).rejects.toThrow('failed (retryable)');
  });

  // --- Lock acquisition ---

  it('acquires Redis lock with NX and sends announcement', async () => {
    await processStreamEvent(onlinePayload(), 'job-42');

    // Lock acquired
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^announce:lock:chat-1:/),
      'job-42',
      'EX',
      120,
      'NX',
    );
    expect(mockProvider.sendAnnouncement).toHaveBeenCalled();
  });

  it('allows re-entrant retry when lock holder matches jobId', async () => {
    // First set NX fails (lock already held)
    (redis.set as Mock).mockImplementation((...args: unknown[]) => {
      const key = args[0] as string;
      if (key.startsWith('announce:lock:')) return Promise.resolve(null); // NX fail
      return Promise.resolve('OK'); // session key etc.
    });
    // Lock value matches our jobId — re-entrant
    (redis.get as Mock).mockImplementation((...args: unknown[]) => {
      const key = args[0] as string;
      if (key.startsWith('announce:lock:')) return Promise.resolve('job-42');
      if (key.startsWith('announce:notified:')) return Promise.resolve(null);
      return Promise.resolve(null);
    });

    await processStreamEvent(onlinePayload(), 'job-42');

    // TTL refreshed
    expect(redis.expire).toHaveBeenCalledWith(expect.stringMatching(/^announce:lock:/), 120);
    // Send still proceeds
    expect(mockProvider.sendAnnouncement).toHaveBeenCalled();
  });

  it('skips chat when lock is held by a different job', async () => {
    (redis.set as Mock).mockImplementation((...args: unknown[]) => {
      const key = args[0] as string;
      if (key.startsWith('announce:lock:')) return Promise.resolve(null); // NX fail
      return Promise.resolve('OK');
    });
    // Different holder
    (redis.get as Mock).mockImplementation((...args: unknown[]) => {
      const key = args[0] as string;
      if (key.startsWith('announce:lock:')) return Promise.resolve('other-job-99');
      return Promise.resolve(null);
    });

    await processStreamEvent(onlinePayload(), 'job-42');

    // Should NOT send — another worker owns the lock
    expect(mockProvider.sendAnnouncement).not.toHaveBeenCalled();
    // No failure logged (it's a dedup skip, not an error)
    expect(prisma.announcementLog.create).not.toHaveBeenCalled();
  });

  // --- Post-lock DB re-check (phantom success) ---

  it('edits instead of resending when post-lock DB check finds phantom success', async () => {
    // Post-lock findFirst returns a record (message sent by crashed worker)
    (prisma.announcementLog.findFirst as Mock).mockResolvedValue({
      id: 'log-phantom',
      chatId: 'chat-1',
      streamSessionId: 'ch-1:2026-02-24T12:00:00Z',
      providerMsgId: 'msg-phantom',
      status: 'sent',
    });

    await processStreamEvent(onlinePayload(), 'job-1');

    expect(mockProvider.editAnnouncement).toHaveBeenCalledWith(
      '-1001234567890',
      'msg-phantom',
      expect.objectContaining({ text: expect.any(String) }),
    );
    expect(mockProvider.sendAnnouncement).not.toHaveBeenCalled();
  });

  it('skips silently when post-lock edit gets permanent error (phantom message deleted)', async () => {
    (prisma.announcementLog.findFirst as Mock).mockResolvedValue({
      id: 'log-phantom',
      chatId: 'chat-1',
      streamSessionId: 'ch-1:2026-02-24T12:00:00Z',
      providerMsgId: 'msg-phantom',
      status: 'sent',
    });
    mockProvider.editAnnouncement.mockRejectedValue(permanentError('message not found'));

    await processStreamEvent(onlinePayload(), 'job-1');

    // No send — phantom was found, edit failed permanently, move on
    expect(mockProvider.sendAnnouncement).not.toHaveBeenCalled();
  });

  it('throws when post-lock edit gets transient error', async () => {
    (prisma.announcementLog.findFirst as Mock).mockResolvedValue({
      id: 'log-phantom',
      chatId: 'chat-1',
      streamSessionId: 'ch-1:2026-02-24T12:00:00Z',
      providerMsgId: 'msg-phantom',
      status: 'sent',
    });
    mockProvider.editAnnouncement.mockRejectedValue(transientError('timeout'));

    await expect(processStreamEvent(onlinePayload(), 'job-1')).rejects.toThrow('failed (retryable)');
  });

  // --- Stale record cleanup ---

  it('deletes stale sent record (no providerMsgId) before sending fresh', async () => {
    // Batch query returns a "sent" record but without providerMsgId (DB write succeeded, provider didn't return ID)
    const staleLog = {
      id: 'log-stale',
      chatId: 'chat-1',
      streamSessionId: 'ch-1:2026-02-24T12:00:00Z',
      providerMsgId: null,
      status: 'sent',
    };
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([staleLog]);
    // Post-lock also returns nothing (no phantom)
    (prisma.announcementLog.findFirst as Mock).mockResolvedValue(null);

    await processStreamEvent(onlinePayload(), 'job-1');

    // Stale record deleted
    expect(prisma.announcementLog.delete).toHaveBeenCalledWith({ where: { id: 'log-stale' } });
    // Fresh send
    expect(mockProvider.sendAnnouncement).toHaveBeenCalled();
    // New log created
    expect(prisma.announcementLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent', providerMsgId: 'msg-100' }),
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════
// 3. handleStreamOnline — error handling
// ═════════════════════════════════════════════════════════════

describe('handleStreamOnline error handling', () => {
  beforeEach(() => {
    const streamer = makeStreamer();
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
  });

  it('disables chat on permanent provider error', async () => {
    mockProvider.sendAnnouncement.mockRejectedValue(permanentError('bot blocked'));

    // Permanent error → chat disabled but function resolves (not retryable)
    await processStreamEvent(onlinePayload(), 'job-1');

    expect(prisma.connectedChat.update).toHaveBeenCalledWith({
      where: { id: 'chat-1' },
      data: { enabled: false },
    });
  });

  it('creates failed announcement log on permanent error', async () => {
    mockProvider.sendAnnouncement.mockRejectedValue(permanentError('bot blocked'));

    await processStreamEvent(onlinePayload(), 'job-1');

    expect(prisma.announcementLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          error: 'bot blocked',
        }),
      }),
    );
  });

  it('does NOT disable chat on transient error', async () => {
    mockProvider.sendAnnouncement.mockRejectedValue(transientError('timeout'));

    await expect(processStreamEvent(onlinePayload(), 'job-1')).rejects.toThrow();

    // update should only be called for lastMessageId update, NOT for disabling
    // Since send failed, connectedChat.update should not have been called at all for this chat
    const updateCalls = (prisma.connectedChat.update as Mock).mock.calls;
    const disableCalls = updateCalls.filter(
      (call: unknown[]) => (call[0] as { data: { enabled?: boolean } }).data.enabled === false,
    );
    expect(disableCalls).toHaveLength(0);
  });

  it('does NOT release Redis lock on transient error (let TTL expire)', async () => {
    mockProvider.sendAnnouncement.mockRejectedValue(transientError('timeout'));

    await expect(processStreamEvent(onlinePayload(), 'job-1')).rejects.toThrow();

    // Redis del should NOT be called for the lock key
    const delCalls = (redis.del as Mock).mock.calls;
    const lockDelCalls = delCalls.filter((call: unknown[]) =>
      (call[0] as string).startsWith('announce:lock:'),
    );
    expect(lockDelCalls).toHaveLength(0);
  });

  it('throws error with count of retryable failures for BullMQ retry', async () => {
    mockProvider.sendAnnouncement.mockRejectedValue(transientError('timeout'));

    await expect(processStreamEvent(onlinePayload(), 'job-1')).rejects.toThrow(
      '1/1 announcement deliveries failed (retryable)',
    );
  });

  it('resolves when all failures are permanent (no retryable failures)', async () => {
    const streamer = makeStreamer({
      chats: [
        makeChat({ id: 'chat-1', chatId: '-100111' }),
        makeChat({ id: 'chat-2', chatId: '-100222' }),
      ],
    });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    mockProvider.sendAnnouncement.mockRejectedValue(permanentError('bot blocked'));

    // Permanent failures don't cause a throw — they're handled (chat disabled)
    await processStreamEvent(onlinePayload(), 'job-1');

    expect(prisma.connectedChat.update).toHaveBeenCalledTimes(2);
  });

  it('reports mixed permanent+transient as only transient count', async () => {
    const streamer = makeStreamer({
      chats: [
        makeChat({ id: 'chat-1', chatId: '-100111' }),
        makeChat({ id: 'chat-2', chatId: '-100222' }),
      ],
    });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);

    mockProvider.sendAnnouncement
      .mockRejectedValueOnce(permanentError('bot blocked'))      // chat-1: permanent
      .mockRejectedValueOnce(transientError('timeout'));          // chat-2: transient

    await expect(processStreamEvent(onlinePayload(), 'job-1')).rejects.toThrow(
      '1/2 announcement deliveries failed (retryable)',
    );
  });
});

// ═════════════════════════════════════════════════════════════
// 4. handleStreamOnline — DM notification dedup
// ═════════════════════════════════════════════════════════════

describe('handleStreamOnline DM notification', () => {
  it('sends DM to streamer on first successful delivery', async () => {
    const streamer = makeStreamer({ telegramUserId: 'tg-user-123' });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (hasProvider as Mock).mockReturnValue(true);
    (getProvider as Mock).mockReturnValue(mockProvider);

    await processStreamEvent(onlinePayload(), 'job-1');

    // DM sent via provider (the last sendAnnouncement call is to the streamer's DM)
    const sendCalls = mockProvider.sendAnnouncement.mock.calls;
    const dmCall = sendCalls.find((call: unknown[]) => call[0] === 'tg-user-123');
    expect(dmCall).toBeDefined();

    // Notification dedup key set
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^announce:notified:streamer-1:/),
      '1',
      'EX',
      48 * 60 * 60,
    );
  });

  it('skips DM on BullMQ retry when already notified', async () => {
    const streamer = makeStreamer({ telegramUserId: 'tg-user-123' });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (hasProvider as Mock).mockReturnValue(true);
    (getProvider as Mock).mockReturnValue(mockProvider);

    // Simulate already notified
    (redis.get as Mock).mockImplementation((...args: unknown[]) => {
      const key = args[0] as string;
      if (key.startsWith('announce:notified:')) return Promise.resolve('1');
      return Promise.resolve(null);
    });

    await processStreamEvent(onlinePayload(), 'job-1');

    // Only ONE sendAnnouncement call — the actual message, no DM
    const sendCalls = mockProvider.sendAnnouncement.mock.calls;
    const dmCall = sendCalls.find((call: unknown[]) => call[0] === 'tg-user-123');
    expect(dmCall).toBeUndefined();
  });

  it('does not fail overall if DM to streamer throws', async () => {
    const streamer = makeStreamer({ telegramUserId: 'tg-user-123' });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (hasProvider as Mock).mockReturnValue(true);

    // Main send succeeds, DM send fails
    let callIndex = 0;
    mockProvider.sendAnnouncement.mockImplementation((...args: unknown[]) => {
      callIndex++;
      if (args[0] === 'tg-user-123') {
        return Promise.reject(new Error('DM failed'));
      }
      return Promise.resolve({ messageId: 'msg-100' });
    });
    (getProvider as Mock).mockReturnValue(mockProvider);

    // Should NOT throw — DM failure is swallowed
    await processStreamEvent(onlinePayload(), 'job-1');
  });

  it('skips DM when streamer has no telegramUserId', async () => {
    const streamer = makeStreamer({ telegramUserId: null });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (hasProvider as Mock).mockReturnValue(true);
    (getProvider as Mock).mockReturnValue(mockProvider);

    await processStreamEvent(onlinePayload(), 'job-1');

    // Only one call (the actual announcement), no DM
    expect(mockProvider.sendAnnouncement).toHaveBeenCalledTimes(1);
    expect(mockProvider.sendAnnouncement).toHaveBeenCalledWith(
      '-1001234567890',
      expect.any(Object),
    );
  });

  it('skips DM when telegram provider is not registered', async () => {
    const streamer = makeStreamer({ telegramUserId: 'tg-user-123' });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (hasProvider as Mock).mockReturnValue(false); // No telegram provider

    await processStreamEvent(onlinePayload(), 'job-1');

    // Only one call (announcement), no DM
    expect(mockProvider.sendAnnouncement).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════
// 5. handleStreamOnline — happy path end-to-end
// ═════════════════════════════════════════════════════════════

describe('handleStreamOnline happy path', () => {
  it('sends announcement, creates log, and updates connectedChat', async () => {
    const streamer = makeStreamer();
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);

    await processStreamEvent(onlinePayload(), 'job-1');

    // 1. Provider was called
    expect(mockProvider.sendAnnouncement).toHaveBeenCalledWith(
      '-1001234567890',
      expect.objectContaining({
        text: '<b>Stream is live!</b>',
        buttons: [{ label: 'Watch', url: 'https://twitch.tv/test' }],
      }),
    );

    // 2. AnnouncementLog created with sent status
    expect(prisma.announcementLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chatId: 'chat-1',
        streamSessionId: 'ch-1:2026-02-24T12:00:00Z',
        provider: 'telegram',
        providerMsgId: 'msg-100',
        status: 'sent',
        sentAt: expect.any(Date),
      }),
    });

    // 3. ConnectedChat updated with lastMessageId
    expect(prisma.connectedChat.update).toHaveBeenCalledWith({
      where: { id: 'chat-1' },
      data: {
        lastMessageId: 'msg-100',
        lastAnnouncedAt: expect.any(Date),
      },
    });
  });

  it('sends to multiple chats', async () => {
    const streamer = makeStreamer({
      chats: [
        makeChat({ id: 'chat-1', chatId: '-100111' }),
        makeChat({ id: 'chat-2', chatId: '-100222', provider: 'max' }),
      ],
    });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);

    await processStreamEvent(onlinePayload(), 'job-1');

    expect(mockProvider.sendAnnouncement).toHaveBeenCalledTimes(2);
    expect(prisma.announcementLog.create).toHaveBeenCalledTimes(2);
  });
});

// ═════════════════════════════════════════════════════════════
// 6. handleStreamOffline
// ═════════════════════════════════════════════════════════════

describe('handleStreamOffline', () => {
  const sessionId = 'ch-1:2026-02-24T12:00:00Z';

  beforeEach(() => {
    const streamer = makeStreamer({ chats: [] }); // chats fetched separately for offline
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (redis.get as Mock).mockResolvedValue(sessionId);
  });

  it('queries all deleteAfterEnd chats regardless of enabled status', async () => {
    (prisma.connectedChat.findMany as Mock).mockResolvedValue([]);

    await processStreamEvent(offlinePayload());

    expect(prisma.connectedChat.findMany).toHaveBeenCalledWith({
      where: {
        streamerId: 'streamer-1',
        deleteAfterEnd: true,
      },
    });
  });

  it('batch-fetches session logs and recent logs to avoid N+1', async () => {
    const chat = makeChat({ id: 'chat-1', deleteAfterEnd: true, lastMessageId: null });
    (prisma.connectedChat.findMany as Mock).mockResolvedValue([chat]);

    // Two findMany calls in Promise.all for batch fetch
    (prisma.announcementLog.findMany as Mock)
      .mockResolvedValueOnce([]) // session logs
      .mockResolvedValueOnce([]); // recent logs

    await processStreamEvent(offlinePayload());

    // The two batch queries (session logs + recent logs) executed
    const findManyCalls = (prisma.announcementLog.findMany as Mock).mock.calls;
    // At least 2 calls: the batch dedup check from online context won't happen here,
    // but the offline handler's two batch queries should fire
    const offlineBatchCalls = findManyCalls.filter((call: unknown[]) => {
      const where = (call[0] as { where: Record<string, unknown> }).where;
      return 'chatId' in where;
    });
    expect(offlineBatchCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('deletes message and updates log status to deleted', async () => {
    const chat = makeChat({ id: 'chat-1', deleteAfterEnd: true, lastMessageId: 'msg-old' });
    (prisma.connectedChat.findMany as Mock).mockResolvedValue([chat]);

    const sessionLog = {
      id: 'log-1',
      chatId: 'chat-1',
      streamSessionId: sessionId,
      providerMsgId: 'msg-50',
      status: 'sent',
    };
    (prisma.announcementLog.findMany as Mock)
      .mockResolvedValueOnce([sessionLog])  // session logs batch
      .mockResolvedValueOnce([]);            // recent logs batch

    await processStreamEvent(offlinePayload());

    // Provider delete called with session log message ID (preferred over lastMessageId)
    expect(mockProvider.deleteMessage).toHaveBeenCalledWith('-1001234567890', 'msg-50');

    // Log updated to deleted
    expect(prisma.announcementLog.updateMany).toHaveBeenCalledWith({
      where: {
        chatId: 'chat-1',
        providerMsgId: 'msg-50',
        status: 'sent',
      },
      data: {
        status: 'deleted',
        deletedAt: expect.any(Date),
      },
    });
  });

  it('falls back to lastMessageId when no session log exists', async () => {
    const chat = makeChat({ id: 'chat-1', deleteAfterEnd: true, lastMessageId: 'msg-fallback' });
    (prisma.connectedChat.findMany as Mock).mockResolvedValue([chat]);

    (prisma.announcementLog.findMany as Mock)
      .mockResolvedValueOnce([])  // no session logs
      .mockResolvedValueOnce([]); // no recent logs

    await processStreamEvent(offlinePayload());

    expect(mockProvider.deleteMessage).toHaveBeenCalledWith('-1001234567890', 'msg-fallback');
  });

  it('falls back to recent log when no session log and no lastMessageId', async () => {
    const chat = makeChat({ id: 'chat-1', deleteAfterEnd: true, lastMessageId: null });
    (prisma.connectedChat.findMany as Mock).mockResolvedValue([chat]);

    const recentLog = {
      id: 'log-recent',
      chatId: 'chat-1',
      streamSessionId: 'some-other-session',
      providerMsgId: 'msg-recent',
      status: 'sent',
      sentAt: new Date(),
    };
    (prisma.announcementLog.findMany as Mock)
      .mockResolvedValueOnce([])         // no session logs
      .mockResolvedValueOnce([recentLog]); // recent log exists

    await processStreamEvent(offlinePayload());

    expect(mockProvider.deleteMessage).toHaveBeenCalledWith('-1001234567890', 'msg-recent');
  });

  it('skips deletion when no messageId found anywhere', async () => {
    const chat = makeChat({ id: 'chat-1', deleteAfterEnd: true, lastMessageId: null });
    (prisma.connectedChat.findMany as Mock).mockResolvedValue([chat]);

    (prisma.announcementLog.findMany as Mock)
      .mockResolvedValueOnce([])  // no session logs
      .mockResolvedValueOnce([]); // no recent logs

    await processStreamEvent(offlinePayload());

    expect(mockProvider.deleteMessage).not.toHaveBeenCalled();
    expect(prisma.announcementLog.updateMany).not.toHaveBeenCalled();
  });

  it('clears lastMessageId on connectedChat after successful deletion', async () => {
    const chat = makeChat({ id: 'chat-1', deleteAfterEnd: true, lastMessageId: 'msg-to-clear' });
    (prisma.connectedChat.findMany as Mock).mockResolvedValue([chat]);

    (prisma.announcementLog.findMany as Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await processStreamEvent(offlinePayload());

    expect(prisma.connectedChat.update).toHaveBeenCalledWith({
      where: { id: 'chat-1' },
      data: { lastMessageId: null },
    });
  });

  it('does NOT clear lastMessageId when it was already null', async () => {
    const chat = makeChat({ id: 'chat-1', deleteAfterEnd: true, lastMessageId: null });
    (prisma.connectedChat.findMany as Mock).mockResolvedValue([chat]);

    const sessionLog = {
      id: 'log-1', chatId: 'chat-1', streamSessionId: sessionId,
      providerMsgId: 'msg-50', status: 'sent',
    };
    (prisma.announcementLog.findMany as Mock)
      .mockResolvedValueOnce([sessionLog])
      .mockResolvedValueOnce([]);

    await processStreamEvent(offlinePayload());

    // connectedChat.update should NOT be called to set lastMessageId to null
    // (it was already null — skip redundant write)
    const updateCalls = (prisma.connectedChat.update as Mock).mock.calls;
    const nullMsgCalls = updateCalls.filter(
      (call: unknown[]) => (call[0] as { data: { lastMessageId: null } }).data.lastMessageId === null,
    );
    expect(nullMsgCalls).toHaveLength(0);
  });

  it('throws for BullMQ retry when deletion fails', async () => {
    const chat = makeChat({ id: 'chat-1', deleteAfterEnd: true, lastMessageId: 'msg-1' });
    (prisma.connectedChat.findMany as Mock).mockResolvedValue([chat]);

    (prisma.announcementLog.findMany as Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockProvider.deleteMessage.mockRejectedValue(new Error('API error'));

    await expect(processStreamEvent(offlinePayload())).rejects.toThrow(
      '1/1 announcement deletions failed',
    );
  });

  it('handles multiple chats with mixed success and failure', async () => {
    const chats = [
      makeChat({ id: 'chat-1', chatId: '-100111', deleteAfterEnd: true, lastMessageId: 'msg-1' }),
      makeChat({ id: 'chat-2', chatId: '-100222', deleteAfterEnd: true, lastMessageId: 'msg-2' }),
    ];
    (prisma.connectedChat.findMany as Mock).mockResolvedValue(chats);

    (prisma.announcementLog.findMany as Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockProvider.deleteMessage
      .mockResolvedValueOnce(undefined)              // chat-1 succeeds
      .mockRejectedValueOnce(new Error('API error')); // chat-2 fails

    await expect(processStreamEvent(offlinePayload())).rejects.toThrow(
      '1/2 announcement deletions failed',
    );

    // chat-1 was still cleaned up successfully
    expect(prisma.announcementLog.updateMany).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
// 7. handleStreamUpdate
// ═════════════════════════════════════════════════════════════

describe('handleStreamUpdate', () => {
  const sessionId = 'ch-1:2026-02-24T12:00:00Z';

  beforeEach(() => {
    const streamer = makeStreamer();
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (redis.get as Mock).mockResolvedValue(sessionId);
  });

  it('edits existing sent messages with updated text', async () => {
    const sentLog = {
      id: 'log-1',
      chatId: 'chat-1',
      streamSessionId: sessionId,
      providerMsgId: 'msg-50',
      status: 'sent',
    };
    // First findMany is the batch dedup check for "online" path — won't happen here.
    // The update path calls findMany to get sent logs for this session.
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([sentLog]);

    await processStreamEvent(updatePayload());

    expect(mockProvider.editAnnouncement).toHaveBeenCalledWith(
      '-1001234567890',
      'msg-50',
      expect.objectContaining({ text: '<b>Stream is live!</b>' }),
    );
  });

  it('returns early when no sent messages found for this session', async () => {
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([]);

    await processStreamEvent(updatePayload());

    expect(mockProvider.editAnnouncement).not.toHaveBeenCalled();
  });

  it('skips chat with no providerMsgId in log', async () => {
    const sentLog = {
      id: 'log-1',
      chatId: 'chat-1',
      streamSessionId: sessionId,
      providerMsgId: null, // no message ID
      status: 'sent',
    };
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([sentLog]);

    await processStreamEvent(updatePayload());

    expect(mockProvider.editAnnouncement).not.toHaveBeenCalled();
  });

  it('handles permanent edit error gracefully (message deleted externally)', async () => {
    const sentLog = {
      id: 'log-1',
      chatId: 'chat-1',
      streamSessionId: sessionId,
      providerMsgId: 'msg-50',
      status: 'sent',
    };
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([sentLog]);
    mockProvider.editAnnouncement.mockRejectedValue(permanentError('message not found'));

    // Should NOT throw — permanent errors are logged and skipped
    await processStreamEvent(updatePayload());
  });

  it('throws for transient edit errors during update (for BullMQ retry)', async () => {
    const sentLog = {
      id: 'log-1',
      chatId: 'chat-1',
      streamSessionId: sessionId,
      providerMsgId: 'msg-50',
      status: 'sent',
    };
    (prisma.announcementLog.findMany as Mock).mockResolvedValue([sentLog]);
    mockProvider.editAnnouncement.mockRejectedValue(transientError('timeout'));

    // handleStreamUpdate accumulates transient failures and re-throws for BullMQ retry
    await expect(processStreamEvent(updatePayload())).rejects.toThrow('1 stream update edits failed (retryable)');
  });

  it('edits multiple chats independently', async () => {
    const streamer = makeStreamer({
      chats: [
        makeChat({ id: 'chat-1', chatId: '-100111' }),
        makeChat({ id: 'chat-2', chatId: '-100222' }),
      ],
    });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);

    const sentLogs = [
      { id: 'log-1', chatId: 'chat-1', streamSessionId: sessionId, providerMsgId: 'msg-1', status: 'sent' },
      { id: 'log-2', chatId: 'chat-2', streamSessionId: sessionId, providerMsgId: 'msg-2', status: 'sent' },
    ];
    (prisma.announcementLog.findMany as Mock).mockResolvedValue(sentLogs);

    await processStreamEvent(updatePayload());

    expect(mockProvider.editAnnouncement).toHaveBeenCalledTimes(2);
    expect(mockProvider.editAnnouncement).toHaveBeenCalledWith('-100111', 'msg-1', expect.any(Object));
    expect(mockProvider.editAnnouncement).toHaveBeenCalledWith('-100222', 'msg-2', expect.any(Object));
  });

  it('continues editing remaining chats when one fails', async () => {
    const streamer = makeStreamer({
      chats: [
        makeChat({ id: 'chat-1', chatId: '-100111' }),
        makeChat({ id: 'chat-2', chatId: '-100222' }),
      ],
    });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);

    const sentLogs = [
      { id: 'log-1', chatId: 'chat-1', streamSessionId: sessionId, providerMsgId: 'msg-1', status: 'sent' },
      { id: 'log-2', chatId: 'chat-2', streamSessionId: sessionId, providerMsgId: 'msg-2', status: 'sent' },
    ];
    (prisma.announcementLog.findMany as Mock).mockResolvedValue(sentLogs);

    mockProvider.editAnnouncement
      .mockRejectedValueOnce(transientError('timeout'))  // chat-1 fails
      .mockResolvedValueOnce(undefined);                  // chat-2 succeeds

    // Should throw because of 1 transient failure, but both chats were attempted
    await expect(processStreamEvent(updatePayload())).rejects.toThrow('1 stream update edits failed (retryable)');

    // Both were attempted
    expect(mockProvider.editAnnouncement).toHaveBeenCalledTimes(2);
  });
});

// ═════════════════════════════════════════════════════════════
// 8. sanitizeThumbnailUrl (tested indirectly through online)
// ═════════════════════════════════════════════════════════════

describe('thumbnailUrl sanitization', () => {
  beforeEach(() => {
    const streamer = makeStreamer();
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
  });

  it('passes allowed Twitch CDN thumbnail through', async () => {
    const payload = onlinePayload({
      thumbnailUrl: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_test-{width}x{height}.jpg',
    });

    await processStreamEvent(payload, 'job-1');

    expect(mockProvider.sendAnnouncement).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        photoUrl: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_test-1280x720.jpg',
      }),
    );
  });

  it('blocks thumbnail from disallowed host', async () => {
    const payload = onlinePayload({
      thumbnailUrl: 'https://evil.com/ssrf-target.jpg',
    });

    await processStreamEvent(payload, 'job-1');

    expect(mockProvider.sendAnnouncement).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        photoUrl: undefined,
      }),
    );
  });

  it('blocks non-HTTPS thumbnail URLs', async () => {
    const payload = onlinePayload({
      thumbnailUrl: 'http://static-cdn.jtvnw.net/test.jpg',
    });

    await processStreamEvent(payload, 'job-1');

    expect(mockProvider.sendAnnouncement).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        photoUrl: undefined,
      }),
    );
  });

  it('handles undefined thumbnailUrl gracefully', async () => {
    const payload = onlinePayload({ thumbnailUrl: undefined });

    await processStreamEvent(payload, 'job-1');

    expect(mockProvider.sendAnnouncement).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        photoUrl: undefined,
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════
// 9. buildStreamSessionId edge cases
// ═════════════════════════════════════════════════════════════

describe('buildStreamSessionId edge cases', () => {
  it('uses startedAt when provided (online event)', async () => {
    const streamer = makeStreamer();
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);

    await processStreamEvent(onlinePayload({ startedAt: '2026-02-24T15:30:00Z' }), 'job-1');

    // Session key stored with correct session ID
    expect(redis.set).toHaveBeenCalledWith(
      'announce:session:ch-1',
      'ch-1:2026-02-24T15:30:00Z',
      'EX',
      expect.any(Number),
    );
  });

  it('uses fallback ID for offline without startedAt when Redis has no stored session', async () => {
    const streamer = makeStreamer({ chats: [] });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(streamer);
    (redis.get as Mock).mockResolvedValue(null);

    // Offline with no startedAt and no stored session
    await processStreamEvent(offlinePayload({ startedAt: undefined }));

    // connectedChat.findMany will be called with streamerId and the fallback sessionId
    // The key thing is it doesn't crash
    expect(redis.del).toHaveBeenCalledWith('announce:session:ch-1');
  });
});
