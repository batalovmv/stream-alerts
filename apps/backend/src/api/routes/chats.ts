import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type Router as RouterType,
} from 'express';

import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { resolveProvider } from '../../lib/resolveProvider.js';
import { parseStreamPlatforms, parseCustomButtons } from '../../lib/streamPlatforms.js';
import { hasProvider } from '../../providers/registry.js';
import { renderTemplate, buildButtons, buildTemplateVars } from '../../services/templateService.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/types.js';
import {
  validate,
  validateIdParam,
  addChatSchema,
  updateChatSchema,
  emptyBodySchema,
} from '../middleware/validation.js';

const router: RouterType = Router();

// All chat routes require authentication
router.use(requireAuth);

/**
 * GET /api/chats — List connected chats for the current streamer.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { streamer } = req as AuthenticatedRequest;

    const chats = await prisma.connectedChat.findMany({
      where: { streamerId: streamer.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    res.json({ chats });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chats — Connect a new chat.
 */
router.post(
  '/',
  validate(addChatSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { streamer } = req as AuthenticatedRequest;
      const { provider, chatId } = req.body;

      if (!hasProvider(provider)) {
        throw AppError.badRequest(`Unsupported provider: ${provider}`);
      }

      // Load custom bot token to validate with the right bot
      const dbStreamer = await prisma.streamer.findUnique({
        where: { id: streamer.id },
        select: { customBotToken: true },
      });
      const messengerProvider = resolveProvider(provider, dbStreamer?.customBotToken);

      const hasAccess = await messengerProvider.validateBotAccess(chatId);
      if (!hasAccess) {
        const botHint = dbStreamer?.customBotToken
          ? 'Your custom bot does not have admin access to this chat. Please add it as an administrator first.'
          : 'Bot does not have admin access to this chat. Please add the bot as an administrator first.';
        throw new AppError(400, 'BOT_ACCESS_DENIED', botHint);
      }

      const chatInfo = await messengerProvider.getChatInfo(chatId);

      // Atomic count+create inside a transaction to prevent race conditions
      // where two concurrent requests both see count=19 and both create
      const chat = await prisma.$transaction(async (tx) => {
        const chatCount = await tx.connectedChat.count({ where: { streamerId: streamer.id } });
        if (chatCount >= 20) {
          throw AppError.limitExceeded('Maximum 20 chats per streamer');
        }

        const existing = await tx.connectedChat.findUnique({
          where: {
            streamerId_provider_chatId: {
              streamerId: streamer.id,
              provider,
              chatId,
            },
          },
        });
        if (existing) {
          throw AppError.conflict('This chat is already connected');
        }

        return tx.connectedChat.create({
          data: {
            streamerId: streamer.id,
            provider,
            chatId,
            chatTitle: chatInfo.title,
            chatType: chatInfo.type,
          },
        });
      });

      logger.info(
        { streamerId: streamer.id, provider, chatId, chatTitle: chatInfo.title },
        'chat.connected',
      );

      res.status(201).json({ chat });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/chats/:id — Update chat settings.
 */
router.patch(
  '/:id',
  validateIdParam,
  validate(updateChatSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { streamer } = req as AuthenticatedRequest;

      const chat = await prisma.connectedChat.findFirst({
        where: { id: String(req.params.id), streamerId: streamer.id },
      });

      if (!chat) {
        throw AppError.notFound('Chat');
      }

      const { enabled, deleteAfterEnd, customTemplate } = req.body;

      const updated = await prisma.connectedChat.update({
        where: { id: chat.id },
        data: {
          ...(enabled !== undefined && { enabled }),
          ...(deleteAfterEnd !== undefined && { deleteAfterEnd }),
          ...(customTemplate !== undefined && { customTemplate }),
        },
      });

      res.json({ chat: updated });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/chats/:id — Disconnect a chat.
 */
router.delete('/:id', validateIdParam, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { streamer } = req as AuthenticatedRequest;

    const chat = await prisma.connectedChat.findFirst({
      where: { id: String(req.params.id), streamerId: streamer.id },
    });

    if (!chat) {
      throw AppError.notFound('Chat');
    }

    await prisma.connectedChat.delete({ where: { id: chat.id } });

    logger.info({ chatId: chat.chatId, provider: chat.provider }, 'chat.disconnected');

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chats/:id/test — Send a test announcement.
 */
router.post(
  '/:id/test',
  validateIdParam,
  validate(emptyBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { streamer } = req as AuthenticatedRequest;

      const chat = await prisma.connectedChat.findFirst({
        where: { id: String(req.params.id), streamerId: streamer.id },
      });

      if (!chat) {
        throw AppError.notFound('Chat');
      }

      if (!chat.enabled) {
        throw AppError.badRequest('Chat is disabled. Enable it first.');
      }

      const dbStreamer = await prisma.streamer.findUnique({ where: { id: streamer.id } });
      if (!dbStreamer) {
        throw AppError.notFound('Streamer');
      }

      const platforms = parseStreamPlatforms(dbStreamer.streamPlatforms);
      const customButtons = parseCustomButtons(dbStreamer.customButtons);

      const vars = buildTemplateVars({
        displayName: dbStreamer.displayName,
        platforms,
        channelSlug: dbStreamer.channelSlug || dbStreamer.memelabChannelId,
        twitchLogin: dbStreamer.twitchLogin,
        streamTitle: 'Тестовый стрим',
        gameName: 'Just Chatting',
        startedAt: new Date().toISOString(),
      });

      const text = renderTemplate(chat.customTemplate || dbStreamer.defaultTemplate, vars);
      const buttons = buildButtons(vars, customButtons);

      // Use custom bot for test if configured — so streamer sees the actual bot that will send
      const provider = resolveProvider(chat.provider, dbStreamer.customBotToken);
      const result = await provider.sendAnnouncement(chat.chatId, { text, buttons });

      res.json({ ok: true, messageId: result.messageId });
    } catch (error) {
      next(error);
    }
  },
);

export { router as chatsRouter };
