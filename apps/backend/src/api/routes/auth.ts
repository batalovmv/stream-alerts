import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/types.js';
import { config } from '../../lib/config.js';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';

const router: RouterType = Router();

const MEMELAB_LOGIN_URL = config.isDev
  ? 'http://localhost:3001/login'
  : 'https://memelab.ru/login';

const LINK_TOKEN_PREFIX = 'link:token:';
const LINK_TOKEN_TTL = 600; // 10 minutes
const BOT_USERNAME = 'MemelabNotifyBot';

/**
 * GET /api/auth/me — Return current authenticated streamer.
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const { streamer } = req as AuthenticatedRequest;

  const dbStreamer = await prisma.streamer.findUnique({
    where: { id: streamer.id },
    select: { telegramUserId: true },
  });

  res.json({
    user: {
      id: streamer.id,
      memelabUserId: streamer.memelabUserId,
      displayName: streamer.displayName,
      avatarUrl: streamer.avatarUrl,
      twitchLogin: streamer.twitchLogin,
      channelId: streamer.memelabChannelId,
      telegramLinked: !!dbStreamer?.telegramUserId,
    },
  });
});

/**
 * GET /api/auth/login — Redirect to MemeLab login page.
 */
router.get('/login', (_req: Request, res: Response) => {
  const returnUrl = config.isDev
    ? 'http://localhost:5173/dashboard'
    : 'https://notify.memelab.ru/dashboard';
  res.redirect(`${MEMELAB_LOGIN_URL}?returnUrl=${encodeURIComponent(returnUrl)}`);
});

/**
 * POST /api/auth/logout — Clear the token cookie on .memelab.ru domain.
 */
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(config.jwtCookieName, {
    domain: config.isDev ? undefined : '.memelab.ru',
    path: '/',
    httpOnly: true,
    secure: !config.isDev,
    sameSite: 'lax',
  });
  res.json({ ok: true });
});

/**
 * POST /api/auth/telegram-link — Generate a one-time Telegram deep link
 * for linking the user's Telegram account to their MemeLab streamer.
 */
router.post('/telegram-link', requireAuth, async (req: Request, res: Response) => {
  const { streamer } = req as AuthenticatedRequest;

  const dbStreamer = await prisma.streamer.findUnique({
    where: { id: streamer.id },
    select: { telegramUserId: true },
  });

  if (dbStreamer?.telegramUserId) {
    res.json({
      linked: true,
      message: 'Telegram account is already linked',
    });
    return;
  }

  const token = randomBytes(16).toString('hex');
  await redis.setex(LINK_TOKEN_PREFIX + token, LINK_TOKEN_TTL, streamer.id);

  const deepLink = `https://t.me/${BOT_USERNAME}?start=link_${token}`;

  res.json({
    linked: false,
    deepLink,
    expiresIn: LINK_TOKEN_TTL,
  });
});

/**
 * POST /api/auth/telegram-unlink — Unlink Telegram account from streamer.
 */
router.post('/telegram-unlink', requireAuth, async (req: Request, res: Response) => {
  const { streamer } = req as AuthenticatedRequest;

  await prisma.streamer.update({
    where: { id: streamer.id },
    data: { telegramUserId: null },
  });

  res.json({ ok: true });
});

export { router as authRouter };
