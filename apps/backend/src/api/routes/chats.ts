import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { prisma } from '../../lib/prisma.js';
import { hasProvider } from '../../providers/registry.js';
import { resolveProvider } from '../../lib/resolveProvider.js';
import { renderTemplate, buildButtons, buildTemplateVars } from '../../services/templateService.js';
import { parseStreamPlatforms, parseCustomButtons } from '../../lib/streamPlatforms.js';
import { logger } from '../../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, validateIdParam, addChatSchema, updateChatSchema } from '../middleware/validation.js';
import type { AuthenticatedRequest } from '../middleware/types.js';

const router: RouterType = Router();

// All chat routes require authentication
router.use(requireAuth);

/**
 * GET /api/chats — List connected chats for the current streamer.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { streamer } = req as AuthenticatedRequest;

    const chats = await prisma.connectedChat.findMany({
      where: { streamerId: streamer.id },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ chats });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg }, 'chats.list_failed');
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

/**
 * POST /api/chats — Connect a new chat.
 */
router.post('/', validate(addChatSchema), async (req: Request, res: Response) => {
  try {
    const { streamer } = req as AuthenticatedRequest;
    const { provider, chatId } = req.body;

    if (!hasProvider(provider)) {
      res.status(400).json({ error: `Unsupported provider: ${provider}` });
      return;
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
      res.status(400).json({ error: botHint });
      return;
    }

    const chatInfo = await messengerProvider.getChatInfo(chatId);

    // Enforce max chats per streamer (same limit as bot: 20)
    const chatCount = await prisma.connectedChat.count({ where: { streamerId: streamer.id } });
    if (chatCount >= 20) {
      res.status(400).json({ error: 'Maximum 20 chats per streamer' });
      return;
    }

    const existing = await prisma.connectedChat.findUnique({
      where: {
        streamerId_provider_chatId: {
          streamerId: streamer.id,
          provider,
          chatId,
        },
      },
    });

    if (existing) {
      res.status(409).json({ error: 'This chat is already connected' });
      return;
    }

    const chat = await prisma.connectedChat.create({
      data: {
        streamerId: streamer.id,
        provider,
        chatId,
        chatTitle: chatInfo.title,
        chatType: chatInfo.type,
      },
    });

    logger.info(
      { streamerId: streamer.id, provider, chatId, chatTitle: chatInfo.title },
      'chat.connected',
    );

    res.status(201).json({ chat });
  } catch (error) {
    // Handle unique constraint violation (race condition: two concurrent requests)
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2002') {
      res.status(409).json({ error: 'This chat is already connected' });
      return;
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg }, 'chats.create_failed');
    res.status(500).json({ error: 'Failed to connect chat' });
  }
});

/**
 * PATCH /api/chats/:id — Update chat settings.
 */
router.patch('/:id', validateIdParam, validate(updateChatSchema), async (req: Request, res: Response) => {
  try {
    const { streamer } = req as AuthenticatedRequest;

    const chat = await prisma.connectedChat.findFirst({
      where: { id: String(req.params.id), streamerId: streamer.id },
    });

    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
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
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg }, 'chats.update_failed');
    res.status(500).json({ error: 'Failed to update chat' });
  }
});

/**
 * DELETE /api/chats/:id — Disconnect a chat.
 */
router.delete('/:id', validateIdParam, async (req: Request, res: Response) => {
  try {
    const { streamer } = req as AuthenticatedRequest;

    const chat = await prisma.connectedChat.findFirst({
      where: { id: String(req.params.id), streamerId: streamer.id },
    });

    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    await prisma.connectedChat.delete({ where: { id: chat.id } });

    logger.info({ chatId: chat.chatId, provider: chat.provider }, 'chat.disconnected');

    res.json({ ok: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg }, 'chats.delete_failed');
    res.status(500).json({ error: 'Failed to disconnect chat' });
  }
});

/**
 * POST /api/chats/:id/test — Send a test announcement.
 */
router.post('/:id/test', validateIdParam, async (req: Request, res: Response) => {
  try {
    const { streamer } = req as AuthenticatedRequest;

    const chat = await prisma.connectedChat.findFirst({
      where: { id: String(req.params.id), streamerId: streamer.id },
    });

    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    if (!chat.enabled) {
      res.status(400).json({ error: 'Chat is disabled. Enable it first.' });
      return;
    }

    const dbStreamer = await prisma.streamer.findUnique({ where: { id: streamer.id } });
    if (!dbStreamer) {
      res.status(404).json({ error: 'Streamer not found' });
      return;
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
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ chatId: req.params.id, error: errMsg }, 'chat.test_failed');
    res.status(500).json({ error: 'Failed to send test announcement' });
  }
});

export { router as chatsRouter };
