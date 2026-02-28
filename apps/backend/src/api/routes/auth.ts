import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { requireAuth, extractToken, hashToken, AUTH_CACHE_PREFIX, fetchMemelabProfile } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/types.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { getBotUsername } from '../../bot/setup.js';
import { upsertStreamerFromProfile } from '../../services/streamerService.js';

const router: RouterType = Router();

const MEMELAB_LOGIN_URL = config.isDev
  ? 'http://localhost:3001/login'
  : 'https://memelab.ru/login';

const LINK_TOKEN_PREFIX = 'link:token:';
const LINK_TOKEN_TTL = 600; // 10 minutes

/**
 * GET /api/auth/me — Return current authenticated streamer.
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
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
 * POST /api/auth/logout — Clear the token cookie and invalidate auth cache.
 */
router.post('/logout', (req: Request, res: Response) => {
  // Invalidate cached profile so stale sessions can't be used
  const token = extractToken(req);
  if (token) {
    const hash = createHash('sha256').update(token).digest('hex');
    redis.del('auth:profile:' + hash).catch(() => {});
  }

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
  try {
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

    const deepLink = `https://t.me/${getBotUsername()}?start=link_${token}`;

    res.json({
      linked: false,
      deepLink,
      expiresIn: LINK_TOKEN_TTL,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/telegram-unlink — Unlink Telegram account from streamer.
 */
router.post('/telegram-unlink', requireAuth, async (req: Request, res: Response) => {
  try {
    const { streamer } = req as AuthenticatedRequest;

    const dbStreamer = await prisma.streamer.findUnique({
      where: { id: streamer.id },
      select: { telegramUserId: true },
    });

    if (!dbStreamer?.telegramUserId) {
      res.json({ ok: true, message: 'No Telegram account linked' });
      return;
    }

    await prisma.streamer.update({
      where: { id: streamer.id },
      data: { telegramUserId: null },
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/sync — Force-refresh streamer profile from MemeLab.
 * Busts Redis auth cache and re-syncs platforms from memelab.ru.
 */
router.post('/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Bust cache
    await redis.del(AUTH_CACHE_PREFIX + hashToken(token));

    // Re-fetch and upsert
    const fetchResult = await fetchMemelabProfile(token);
    if (!fetchResult.profile || !fetchResult.profile.channel) {
      res.status(502).json({ error: 'Could not fetch profile from MemeLab' });
      return;
    }

    type ProfileWithChannel = typeof fetchResult.profile & {
      channel: NonNullable<typeof fetchResult.profile.channel>;
    };
    await upsertStreamerFromProfile(fetchResult.profile as ProfileWithChannel);

    res.json({ ok: true });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'auth.sync_failed');
    res.status(500).json({ error: 'Sync failed' });
  }
});

export { router as authRouter };
