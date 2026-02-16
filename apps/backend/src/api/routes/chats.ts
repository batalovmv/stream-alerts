import { Router, type Request, type Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { getProvider, hasProvider } from '../../providers/registry.js';
import { renderTemplate, buildDefaultButtons } from '../../services/templateService.js';
import { logger } from '../../lib/logger.js';

const router = Router();

// TODO: Add auth middleware — for now placeholder

/**
 * GET /api/chats — List connected chats for the current streamer.
 */
router.get('/', async (req: Request, res: Response) => {
  const streamerId = (req as any).streamerId as string | undefined;
  if (!streamerId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const chats = await prisma.connectedChat.findMany({
    where: { streamerId },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ chats });
});

/**
 * POST /api/chats — Connect a new chat.
 */
router.post('/', async (req: Request, res: Response) => {
  const streamerId = (req as any).streamerId as string | undefined;
  if (!streamerId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { provider, chatId } = req.body;

  if (!provider || !chatId) {
    res.status(400).json({ error: 'Missing required fields: provider, chatId' });
    return;
  }

  if (!hasProvider(provider)) {
    res.status(400).json({ error: `Unsupported provider: ${provider}` });
    return;
  }

  // Validate bot access
  const messengerProvider = getProvider(provider);

  const hasAccess = await messengerProvider.validateBotAccess(chatId);
  if (!hasAccess) {
    res.status(400).json({ error: 'Bot does not have admin access to this chat. Please add the bot as an administrator first.' });
    return;
  }

  // Get chat info
  const chatInfo = await messengerProvider.getChatInfo(chatId);

  // Check for duplicate
  const existing = await prisma.connectedChat.findUnique({
    where: { streamerId_provider_chatId: { streamerId, provider, chatId } },
  });

  if (existing) {
    res.status(409).json({ error: 'This chat is already connected' });
    return;
  }

  const chat = await prisma.connectedChat.create({
    data: {
      streamerId,
      provider,
      chatId,
      chatTitle: chatInfo.title,
      chatType: chatInfo.type,
    },
  });

  logger.info({ streamerId, provider, chatId, chatTitle: chatInfo.title }, 'chat.connected');

  res.status(201).json({ chat });
});

/**
 * PATCH /api/chats/:id — Update chat settings.
 */
router.patch('/:id', async (req: Request, res: Response) => {
  const streamerId = (req as any).streamerId as string | undefined;
  if (!streamerId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const chat = await prisma.connectedChat.findFirst({
    where: { id: req.params.id, streamerId },
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
  const streamerId = (req as any).streamerId as string | undefined;
  if (!streamerId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const chat = await prisma.connectedChat.findFirst({
    where: { id: req.params.id, streamerId },
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
  const streamerId = (req as any).streamerId as string | undefined;
  if (!streamerId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const chat = await prisma.connectedChat.findFirst({
    where: { id: req.params.id, streamerId },
    include: { streamer: true },
  });

  if (!chat) {
    res.status(404).json({ error: 'Chat not found' });
    return;
  }

  const vars = {
    streamer_name: chat.streamer.displayName,
    stream_title: 'Тестовый стрим',
    game_name: 'Just Chatting',
    stream_url: chat.streamer.twitchLogin ? `https://twitch.tv/${chat.streamer.twitchLogin}` : undefined,
    memelab_url: `https://memelab.ru/${chat.streamer.memelabChannelId}`,
  };

  const text = renderTemplate(chat.customTemplate || chat.streamer.defaultTemplate, vars);
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
