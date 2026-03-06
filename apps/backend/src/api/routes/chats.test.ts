/**
 * Tests for chats route handlers.
 *
 * Strategy: mock all external deps (prisma, registry, resolveProvider,
 * templateService, streamPlatforms, logger), extract route handlers from the
 * router stack, and invoke them directly with fake req/res/next objects.
 */

import type { Request, Response, NextFunction } from 'express';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ─── Pre-mock imports ────────────────────────────────────────────────────────

import { AppError } from '../../lib/errors.js'; // eslint-disable-line import-x/order

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

vi.mock('../../services/resolveProvider.js', () => ({
  resolveProvider: vi.fn(),
  hasProvider: vi.fn(),
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
  emptyBodySchema: {},
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '../../lib/prisma.js';
import { parseStreamPlatforms, parseCustomButtons } from '../../lib/streamPlatforms.js';
import { resolveProvider, hasProvider } from '../../services/resolveProvider.js';
import { renderTemplate, buildButtons, buildTemplateVars } from '../../services/templateService.js';
import { makeStreamer, makeFakeProvider, createMockReqRes } from '../../test/factories.js';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express Router internals have no public type
  const layers = (chatsRouter as any).stack as Array<{
    route?: {
      path: string;
      stack: Array<{ method: string; handle: Function }>;
    };
  }>;

  for (const layer of layers) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;

    const matchingLayers = layer.route.stack.filter((s) => s.method === method.toLowerCase());
    if (matchingLayers.length > 0) {
      // The last matching layer is the async handler; prior ones are middleware
      return matchingLayers[matchingLayers.length - 1].handle;
    }
  }
  throw new Error(`Handler not found: ${method.toUpperCase()} ${path}`);
}

const DEFAULT_STREAMER = makeStreamer({ id: 'str-1' });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET / — list chats', () => {
  const handler = getHandler('get', '/');

  beforeEach(() => vi.clearAllMocks());

  it('returns the chat list for the authenticated streamer', async () => {
    const fakeChats = [{ id: 'c-1', chatTitle: 'My Channel' }];
    (prisma.connectedChat.findMany as Mock).mockResolvedValue(fakeChats);

    const { req, res, next } = createMockReqRes({ streamer: DEFAULT_STREAMER });
    await handler(req, res, next);

    expect(prisma.connectedChat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { streamerId: 'str-1' } }),
    );
    expect(res.json).toHaveBeenCalledWith({ chats: fakeChats });
  });

  it('calls next with the error on DB failure', async () => {
    const dbError = new Error('db down');
    (prisma.connectedChat.findMany as Mock).mockRejectedValue(dbError);

    const { req, res, next } = createMockReqRes({ streamer: DEFAULT_STREAMER });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST / — connect a new chat', () => {
  const handler = getHandler('post', '/');

  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when the provider is not registered', async () => {
    (hasProvider as Mock).mockReturnValue(false);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      body: { provider: 'unknown', chatId: '-100123' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, code: 'VALIDATION_FAILED' }),
    );
    expect((next as Mock).mock.calls[0][0].message).toMatch(/unsupported provider/i);
  });

  it('returns 400 when bot does not have access (global bot, no custom token)', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    (prisma.streamer.findUnique as Mock).mockResolvedValue({ customBotToken: null });

    const fakeProvider = makeFakeProvider({
      validateBotAccess: vi.fn().mockResolvedValue(false),
    });
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, code: 'BOT_ACCESS_DENIED' }),
    );
    const error = (next as Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/administrator/i);
    // Hint should NOT mention "custom bot" since there is no custom token
    expect(error.message).not.toMatch(/custom bot/i);
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

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, code: 'BOT_ACCESS_DENIED' }),
    );
    const error = (next as Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/custom bot/i);
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

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, code: 'LIMIT_EXCEEDED' }),
    );
    const error = (next as Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/maximum 20/i);
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

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409, code: 'CONFLICT' }));
    const error = (next as Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/already connected/i);
  });

  it('calls next with the P2002 Prisma error on DB-level race', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    (prisma.streamer.findUnique as Mock).mockResolvedValue({ customBotToken: null });

    const fakeProvider = makeFakeProvider();
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    (prisma.$transaction as Mock).mockRejectedValue(p2002);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(p2002);
    expect(res.status).not.toHaveBeenCalled();
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

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ chat: newChat });
  });

  it('calls next with the error on an unexpected failure', async () => {
    (hasProvider as Mock).mockReturnValue(true);
    const unexpectedError = new Error('unexpected');
    (prisma.streamer.findUnique as Mock).mockRejectedValue(unexpectedError);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      body: { provider: 'telegram', chatId: '-100123' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(unexpectedError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /:id — update chat settings', () => {
  const handler = getHandler('patch', '/:id');

  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the chat does not belong to the streamer', async () => {
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(null);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-999' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, code: 'NOT_FOUND' }));
    const error = (next as Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/not found/i);
  });

  it('applies partial updates and returns 200 with the updated chat', async () => {
    const existingChat = { id: 'c-1', enabled: true, deleteAfterEnd: false, customTemplate: null };
    const updatedChat = { ...existingChat, enabled: false };

    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(existingChat);
    (prisma.connectedChat.update as Mock).mockResolvedValue(updatedChat);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
      body: { enabled: false },
    });
    await handler(req, res, next);

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

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
      body: { customTemplate: 'Custom: {streamer_name}' },
    });
    await handler(req, res, next);

    const updateCall = (prisma.connectedChat.update as Mock).mock.calls[0][0];
    // enabled and deleteAfterEnd should NOT be in data since they weren't in body
    expect(updateCall.data).not.toHaveProperty('enabled');
    expect(updateCall.data).not.toHaveProperty('deleteAfterEnd');
    expect(updateCall.data.customTemplate).toBe('Custom: {streamer_name}');
  });

  it('calls next with the error on DB failure', async () => {
    const dbError = new Error('db error');
    (prisma.connectedChat.findFirst as Mock).mockRejectedValue(dbError);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /:id — disconnect a chat', () => {
  const handler = getHandler('delete', '/:id');

  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the chat is not found', async () => {
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(null);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-999' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, code: 'NOT_FOUND' }));
    const error = (next as Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/not found/i);
  });

  it('deletes the chat and returns { ok: true }', async () => {
    const chat = {
      id: 'c-1',
      chatId: '-100123',
      provider: 'telegram',
    };
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(chat);
    (prisma.connectedChat.delete as Mock).mockResolvedValue(chat);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
    });
    await handler(req, res, next);

    expect(prisma.connectedChat.delete).toHaveBeenCalledWith({
      where: { id: 'c-1' },
    });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('calls next with the error on DB failure', async () => {
    const dbError = new Error('db error');
    (prisma.connectedChat.findFirst as Mock).mockRejectedValue(dbError);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /:id/test — send test announcement', () => {
  const handler = getHandler('post', '/:id/test');

  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the chat is not found', async () => {
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue(null);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-999' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, code: 'NOT_FOUND' }));
    const error = (next as Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/not found/i);
  });

  it('returns 400 when the chat is disabled', async () => {
    (prisma.connectedChat.findFirst as Mock).mockResolvedValue({
      id: 'c-1',
      enabled: false,
      provider: 'telegram',
      chatId: '-100123',
    });

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, code: 'VALIDATION_FAILED' }),
    );
    const error = (next as Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/disabled/i);
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

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, code: 'NOT_FOUND' }));
    const error = (next as Mock).mock.calls[0][0] as AppError;
    expect(error.message).toMatch(/streamer not found/i);
  });

  it('sends a test announcement and returns { ok: true }', async () => {
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

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
    });
    await handler(req, res, next);

    expect(resolveProvider).toHaveBeenCalledWith('telegram', null);
    expect(fakeProvider.sendAnnouncement).toHaveBeenCalledWith(
      '-100123',
      expect.objectContaining({ text: 'TestStreamer is live!' }),
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
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

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
    });
    await handler(req, res, next);

    // renderTemplate must be called with the chat's customTemplate, not the default
    expect(renderTemplate).toHaveBeenCalledWith('Custom: {streamer_name}', expect.any(Object));
  });

  it('calls next with the error when sendAnnouncement throws', async () => {
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

    const sendError = new Error('Telegram API error');
    const fakeProvider = makeFakeProvider({
      sendAnnouncement: vi.fn().mockRejectedValue(sendError),
    });
    (resolveProvider as Mock).mockReturnValue(fakeProvider);

    const { req, res, next } = createMockReqRes({
      streamer: DEFAULT_STREAMER,
      params: { id: 'c-1' },
    });
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(sendError);
    expect(res.status).not.toHaveBeenCalled();
  });
});
