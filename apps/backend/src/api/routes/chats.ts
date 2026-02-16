import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { prisma } from '../../lib/prisma.js';
import { getProvider, hasProvider } from '../../providers/registry.js';
import { renderTemplate, buildDefaultButtons } from '../../services/templateService.js';
import { logger } from '../../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, addChatSchema, updateChatSchema } from '../middleware/validation.js';
import type { AuthenticatedRequest } from '../middleware/types.js';

const router: RouterType = Router();

// All chat routes require authentication
router.use(requireAuth);

/**
 * GET /api/chats — List connected chats for the current streamer.
 */
router.get('/', async (req: Request, res: Response) => {
  const { streamer } = req as AuthenticatedRequest;

  const chats = await prisma.connectedChat.findMany({
    where: { streamerId: streamer.id },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ chats });
});

/**
 * POST /api/chats — Connect a new chat.
 */
router.post('/', validate(addChatSchema), async (req: Request, res: Response) => {
  const { streamer } = req as AuthenticatedRequest;
  const { provider, chatId } = req.body;

  if (!hasProvider(provider)) {
    res.status(400).json({ error: `Unsupported provider: ${provider}` });
    return;
  }

  const messengerProvider = getProvider(provider);

  const hasAccess = await messengerProvider.validateBotAccess(chatId);
  if (!hasAccess) {
    res.status(400).json({
      error: 'Bot does not have admin access to this chat. Please add the bot as an administrator first.',
    });
    return;
  }

  const chatInfo = await messengerProvider.getChatInfo(chatId);

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
});

/**
 * PATCH /api/chats/:id — Update chat settings.
 */
router.patch('/:id', validate(updateChatSchema), async (req: Request, res: Response) => {
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
});

/**
 * DELETE /api/chats/:id — Disconnect a chat.
 */
router.delete('/:id', async (req: Request, res: Response) => {
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
});

/**
 * POST /api/chats/:id/test — Send a test announcement.
 */
router.post('/:id/test', async (req: Request, res: Response) => {
  const { streamer } = req as AuthenticatedRequest;

  const chat = await prisma.connectedChat.findFirst({
    where: { id: String(req.params.id), streamerId: streamer.id },
  });

  if (!chat) {
    res.status(404).json({ error: 'Chat not found' });
    return;
  }

  const dbStreamer = await prisma.streamer.findUnique({ where: { id: streamer.id } });
  if (!dbStreamer) {
    res.status(404).json({ error: 'Streamer not found' });
    return;
  }

  const vars = {
    streamer_name: dbStreamer.displayName,
    stream_title: 'Тестовый стрим',
    game_name: 'Just Chatting',
    stream_url: dbStreamer.twitchLogin
      ? `https://twitch.tv/${dbStreamer.twitchLogin}`
      : undefined,
    memelab_url: `https://memelab.ru/${dbStreamer.memelabChannelId}`,
  };

  const text = renderTemplate(chat.customTemplate || dbStreamer.defaultTemplate, vars);
  const buttons = buildDefaultButtons(vars);

  try {
    const provider = getProvider(chat.provider);
    const result = await provider.sendAnnouncement(chat.chatId, { text, buttons });

    res.json({ ok: true, messageId: result.messageId });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ chatId: chat.chatId, error: errMsg }, 'chat.test_failed');
    res.status(500).json({ error: 'Failed to send test announcement', details: errMsg });
  }
});

export { router as chatsRouter };
