/**
 * Tests for chats route handlers.
 *
 * Strategy: mock all external deps (prisma, registry, resolveProvider,
 * templateService, streamPlatforms, logger), extract route handlers from the
 * router stack, and invoke them directly with fake req/res/next objects.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    connectedChat: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    streamer: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../providers/registry.js', () => ({
  hasProvider: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock('../../lib/resolveProvider.js', () => ({
  resolveProvider: vi.fn(),
}));

vi.mock('../../services/templateService.js', () => ({
  renderTemplate: vi.fn(),
  buildButtons: vi.fn(),
  buildTemplateVars: vi.fn(),
}));

vi.mock('../../lib/streamPlatforms.js', () => ({
  parseStreamPlatforms: vi.fn(() => []),
  parseCustomButtons: vi.fn(() => []),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// requireAuth as passthrough — just calls next()
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// validation middleware as passthrough
vi.mock('../middleware/validation.js', () => ({
  validate: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  validateIdParam: (_req: Request, _res: Response, next: NextFunction) => next(),
  addChatSchema: {},
  updateChatSchema: {},
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '../../lib/prisma.js';
import { hasProvider } from '../../providers/registry.js';
import { resolveProvider } from '../../lib/resolveProvider.js';
import {
  renderTemplate,
  buildButtons,
  buildTemplateVars,
} from '../../services/templateService.js';
import { parseStreamPlatforms, parseCustomButtons } from '../../lib/streamPlatforms.js';

// Import the router — this registers handlers on it
import { chatsRouter } from './chats.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pull the final async handler for a given method+path from the router stack.
 *
 * Each route's internal stack holds: [middleware..., asyncHandler].
 * We find all layers for the method and pick the LAST one — that is the
 * actual route handler, not validateIdParam or validate() middleware.
 */
function getHandler(method: string, path: string) {
  const layers = (chatsRouter as any).stack as Array<{
    route?: {
      path: string;
      stack: Array<{ method: string; handle: Function }>;
    };
  }>;

  for (const layer of layers) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;

    const matchingLayers = layer.route.stack.filter(
      (s) => s.method === method.toLowerCase(),
    );
    if (matchingLayers.length > 0) {
      // The last matching layer is the async handler; prior ones are middleware
      return matchingLayers[matchingLayers.length - 1].handle;
    }
  }
  throw new Error(`Handler not found: ${method.toUpperCase()} ${path}`);
}

interface MockReqOverrides {
  streamer?: { id: string; [k: string]: unknown };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}

function createMockReqRes(overrides: MockReqOverrides = {}) {
  const req = {
    streamer: { id: 'str-1' },
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next };
}

/** A minimal fake provider returned by resolveProvider */
function makeFakeProvider(overrides: Partial<{
  validateBotAccess: Mock;
  getChatInfo: Mock;
  sendAnnouncement: Mock;
}> = {}) {
  return {
    name: 'telegram',
    validateBotAccess: vi.fn().mockResolvedValue(true),
    getChatInfo: vi.fn().mockResolvedValue({ title: 'Test Chat', type: 'supergroup' }),
    sendAnnouncement: vi.fn().mockResolvedValue({ messageId: 'msg-42' }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editAnnouncement: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET / — list chats', () => {
  const handler = getHandler('get', '/');

  beforeEach(() => vi.clearAllMocks());

  it('returns the chat list for the authenticated streamer', async () => {
    const fakeChats = [{ id: 'c-1', chatTitle: 'My Channel' }];
    (prisma.connectedChat.findMany as Mock).mockResolvedValue(fakeChats);

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(prisma.connectedChat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { streamerId: 'str-1' } }),
    );
    expect(res.json).toHaveBeenCalledWith({ chats: fakeChats });
  });

  it('returns 500 on DB error', async () => {
    (prisma.connectedChat.findMany as Mock).mockRejectedValue(new Error('db down'));

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to load chats' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST / — connect a new chat', () => {
  const handler = getHandler('post', '/');

  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when the provider is not registered', async () => {
    (hasProvider as Mock).mockReturnValue(false);

    const { req, res } = createMockReqRes({
      body: { provider: 'unknown', chatId: '-100123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/unsupported provider/i);
  });

  it('returns 400 when bot does not have access (global bot, no custom token)', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    (prisma.streamer.findUnique as Mock).mockResolvedValue({ customBotToken: null });

    const fakeProvider = makeFakeProvider({
      validateBotAccess: vi.fn().mockResolvedValue(false),
    });
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const { req, res } = createMockReqRes({
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as Mock).mock.calls[0][0];
    expect(body.error).toMatch(/administrator/i);
    // Hint should NOT mention "custom bot" since there is no custom token
    expect(body.error).not.toMatch(/custom bot/i);
  });

  it('returns 400 with custom-bot hint when access fails and custom token is set', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    (prisma.streamer.findUnique as Mock).mockResolvedValue({
      customBotToken: 'enc:abc123',
    });

    const fakeProvider = makeFakeProvider({
      validateBotAccess: vi.fn().mockResolvedValue(false),
    });
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const { req, res } = createMockReqRes({
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as Mock).mock.calls[0][0];
    expect(body.error).toMatch(/custom bot/i);
  });

  it('returns 400 when the streamer already has 20 chats', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    (prisma.streamer.findUnique as Mock).mockResolvedValue({ customBotToken: null });

    const fakeProvider = makeFakeProvider();
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    // Simulate transaction throwing the limit error
    (prisma.$transaction as Mock).mockImplementation(async (fn: Function) => {
      const tx = {
        connectedChat: {
          count: vi.fn().mockResolvedValue(20),
          findUnique: vi.fn(),
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const { req, res } = createMockReqRes({
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/maximum 20/i);
  });

  it('returns 409 when the chat is already connected (application-level check)', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    (prisma.streamer.findUnique as Mock).mockResolvedValue({ customBotToken: null });

    const fakeProvider = makeFakeProvider();
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    (prisma.$transaction as Mock).mockImplementation(async (fn: Function) => {
      const tx = {
        connectedChat: {
          count: vi.fn().mockResolvedValue(5),
          findUnique: vi.fn().mockResolvedValue({ id: 'existing-c-1' }),
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const { req, res } = createMockReqRes({
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/already connected/i);
  });

  it('returns 409 on P2002 unique constraint violation (DB-level race)', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    (prisma.streamer.findUnique as Mock).mockResolvedValue({ customBotToken: null });

    const fakeProvider = makeFakeProvider();
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    (prisma.$transaction as Mock).mockRejectedValue(p2002);

    const { req, res } = createMockReqRes({
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/already connected/i);
  });

  it('creates the chat and returns 201 on the happy path', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    (prisma.streamer.findUnique as Mock).mockResolvedValue({ customBotToken: null });

    const fakeProvider = makeFakeProvider();
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const newChat = {
      id: 'c-new',
      streamerId: 'str-1',
      provider: 'telegram',
      chatId: '-100123',
      chatTitle: 'Test Chat',
      chatType: 'supergroup',
    };

    (prisma.$transaction as Mock).mockImplementation(async (fn: Function) => {
      const tx = {
        connectedChat: {
          count: vi.fn().mockResolvedValue(0),
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(newChat),
        },
      };
      return fn(tx);
    });

    const { req, res } = createMockReqRes({
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ chat: newChat });
  });

  it('returns 500 on an unexpected error', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    (prisma.streamer.findUnique as Mock).mockRejectedValue(new Error('unexpected'));

    const { req, res } = createMockReqRes({
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/failed to connect/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /:id — update chat settings', () => {
  const handler = getHandler('patch', '/:id');

  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the chat does not belong to the streamer', async () => {
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(null);

    const { req, res } = createMockReqRes({ params: { id: 'c-999' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/not found/i);
  });

  it('applies partial updates and returns 200 with the updated chat', async () => {
    const existingChat = { id: 'c-1', enabled: true, deleteAfterEnd: false, customTemplate: null };
    const updatedChat = { ...existingChat, enabled: false };

    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(existingChat);
    (prisma.connectedChat.update as Mock).mockResolvedValue(updatedChat);

    const { req, res } = createMockReqRes({
      params: { id: 'c-1' },
      body: { enabled: false },
    });
    await handler(req, res);

    expect(prisma.connectedChat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c-1' },
        data: { enabled: false },
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ chat: updatedChat });
  });

  it('updates only fields present in the body (partial update)', async () => {
    const existingChat = {
      id: 'c-1',
      enabled: true,
      deleteAfterEnd: false,
      customTemplate: null,
    };
    const updatedChat = { ...existingChat, customTemplate: 'Custom: {streamer_name}' };

    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(existingChat);
    (prisma.connectedChat.update as Mock).mockResolvedValue(updatedChat);

    const { req, res } = createMockReqRes({
      params: { id: 'c-1' },
      body: { customTemplate: 'Custom: {streamer_name}' },
    });
    await handler(req, res);

    const updateCall = (prisma.connectedChat.update as Mock).mock.calls[0][0];
    // enabled and deleteAfterEnd should NOT be in data since they weren't in body
    expect(updateCall.data).not.toHaveProperty('enabled');
    expect(updateCall.data).not.toHaveProperty('deleteAfterEnd');
    expect(updateCall.data.customTemplate).toBe('Custom: {streamer_name}');
  });

  it('returns 500 on DB error', async () => {
    (prisma.connectedChat.findFirst as Mock).mockRejectedValue(new Error('db error'));

    const { req, res } = createMockReqRes({ params: { id: 'c-1' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/failed to update/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /:id — disconnect a chat', () => {
  const handler = getHandler('delete', '/:id');

  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the chat is not found', async () => {
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(null);

    const { req, res } = createMockReqRes({ params: { id: 'c-999' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/not found/i);
  });

  it('deletes the chat and returns { ok: true }', async () => {
    const chat = {
      id: 'c-1',
      chatId: '-100123',
      provider: 'telegram',
    };
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(chat);
    (prisma.connectedChat.delete as Mock).mockResolvedValue(chat);

    const { req, res } = createMockReqRes({ params: { id: 'c-1' } });
    await handler(req, res);

    expect(prisma.connectedChat.delete).toHaveBeenCalledWith({
      where: { id: 'c-1' },
    });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('returns 500 on DB error', async () => {
    (prisma.connectedChat.findFirst as Mock).mockRejectedValue(new Error('db error'));

    const { req, res } = createMockReqRes({ params: { id: 'c-1' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/failed to disconnect/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /:id/test — send test announcement', () => {
  const handler = getHandler('post', '/:id/test');

  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the chat is not found', async () => {
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(null);

    const { req, res } = createMockReqRes({ params: { id: 'c-999' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/not found/i);
  });

  it('returns 400 when the chat is disabled', async () => {
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue({
      id: 'c-1',
      enabled: false,
      provider: 'telegram',
      chatId: '-100123',
    });

    const { req, res } = createMockReqRes({ params: { id: 'c-1' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/disabled/i);
  });

  it('returns 404 when the streamer record is missing', async () => {
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue({
      id: 'c-1',
      enabled: true,
      provider: 'telegram',
      chatId: '-100123',
      customTemplate: null,
    });
    (prisma.streamer.findUnique as Mock).mockResolvedValue(null);

    const { req, res } = createMockReqRes({ params: { id: 'c-1' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/streamer not found/i);
  });

  it('sends a test announcement and returns { ok: true, messageId }', async () => {
    const chat = {
      id: 'c-1',
      enabled: true,
      provider: 'telegram',
      chatId: '-100123',
      customTemplate: null,
    };
    const dbStreamer = {
      id: 'str-1',
      displayName: 'TestStreamer',
      channelSlug: 'test-streamer',
      memelabChannelId: 'ml-1',
      twitchLogin: 'teststreamer',
      streamPlatforms: null,
      customButtons: null,
      defaultTemplate: null,
      customBotToken: null,
    };

    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(chat);
    (prisma.streamer.findUnique as Mock).mockResolvedValue(dbStreamer);
    (parseStreamPlatforms as Mock).mockReturnValue([]);
    (parseCustomButtons as Mock).mockReturnValue([]);
    (buildTemplateVars as Mock).mockReturnValue({ streamer_name: 'TestStreamer' });
    (renderTemplate as Mock).mockReturnValue('TestStreamer is live!');
    (buildButtons as Mock).mockReturnValue([]);

    const fakeProvider = makeFakeProvider({
      sendAnnouncement: vi.fn().mockResolvedValue({ messageId: 'msg-99' }),
    });
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const { req, res } = createMockReqRes({ params: { id: 'c-1' } });
    await handler(req, res);

    expect(resolveProvider).toHaveBeenCalledWith('telegram', null);
    expect(fakeProvider.sendAnnouncement).toHaveBeenCalledWith(
      '-100123',
      expect.objectContaining({ text: 'TestStreamer is live!' }),
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true, messageId: 'msg-99' });
  });

  it('uses chat.customTemplate when set', async () => {
    const chat = {
      id: 'c-1',
      enabled: true,
      provider: 'telegram',
      chatId: '-100123',
      customTemplate: 'Custom: {streamer_name}',
    };
    const dbStreamer = {
      id: 'str-1',
      displayName: 'TestStreamer',
      channelSlug: 'test-streamer',
      memelabChannelId: 'ml-1',
      twitchLogin: null,
      streamPlatforms: null,
      customButtons: null,
      defaultTemplate: 'Default template',
      customBotToken: null,
    };

    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(chat);
    (prisma.streamer.findUnique as Mock).mockResolvedValue(dbStreamer);
    (parseStreamPlatforms as Mock).mockReturnValue([]);
    (parseCustomButtons as Mock).mockReturnValue([]);
    (buildTemplateVars as Mock).mockReturnValue({ streamer_name: 'TestStreamer' });
    (renderTemplate as Mock).mockReturnValue('Custom: TestStreamer');
    (buildButtons as Mock).mockReturnValue([]);

    const fakeProvider = makeFakeProvider();
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const { req, res } = createMockReqRes({ params: { id: 'c-1' } });
    await handler(req, res);

    // renderTemplate must be called with the chat's customTemplate, not the default
    expect(renderTemplate).toHaveBeenCalledWith(
      'Custom: {streamer_name}',
      expect.any(Object),
    );
  });

  it('returns 500 when sendAnnouncement throws', async () => {
    const chat = {
      id: 'c-1',
      enabled: true,
      provider: 'telegram',
      chatId: '-100123',
      customTemplate: null,
    };
    const dbStreamer = {
      id: 'str-1',
      displayName: 'TestStreamer',
      channelSlug: 'test-streamer',
      memelabChannelId: 'ml-1',
      twitchLogin: null,
      streamPlatforms: null,
      customButtons: null,
      defaultTemplate: null,
      customBotToken: null,
    };

    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(chat);
    (prisma.streamer.findUnique as Mock).mockResolvedValue(dbStreamer);
    (parseStreamPlatforms as Mock).mockReturnValue([]);
    (parseCustomButtons as Mock).mockReturnValue([]);
    (buildTemplateVars as Mock).mockReturnValue({});
    (renderTemplate as Mock).mockReturnValue('text');
    (buildButtons as Mock).mockReturnValue([]);

    const fakeProvider = makeFakeProvider({
      sendAnnouncement: vi.fn().mockRejectedValue(new Error('Telegram API error')),
    });
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const { req, res } = createMockReqRes({ params: { id: 'c-1' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json as Mock).mock.calls[0][0].error).toMatch(/failed to send/i);
  });
});
