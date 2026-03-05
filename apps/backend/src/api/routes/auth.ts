import { randomBytes } from 'node:crypto';

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type Router as RouterType,
} from 'express';

import { getBotUsername } from '../../bot/setup.js';
import { config } from '../../lib/config.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { upsertStreamerFromProfile, PROVIDER_TO_PLATFORM } from '../../services/streamerService.js';
import {
  requireAuth,
  extractToken,
  hashToken,
  AUTH_CACHE_PREFIX,
  fetchMemelabProfile,
} from '../middleware/auth.js';
import type { AuthenticatedRequest, MemelabUserProfile } from '../middleware/types.js';
import { validate, emptyBodySchema } from '../middleware/validation.js';

const router: RouterType = Router();

const MEMELAB_LOGIN_URL = config.isDev ? 'http://localhost:3001/login' : 'https://memelab.ru/login';

const LINK_TOKEN_PREFIX = 'link:token:';
const LINK_TOKEN_TTL = 600; // 10 minutes

/**
 * GET /api/auth/me — Return current authenticated streamer.
 */
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
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
    next(error);
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
router.post('/logout', validate(emptyBodySchema), (req: Request, res: Response) => {
  // Invalidate cached profile so stale sessions can't be used
  const token = extractToken(req);
  if (token) {
    redis.del(AUTH_CACHE_PREFIX + hashToken(token)).catch(() => {});
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
router.post(
  '/telegram-link',
  requireAuth,
  validate(emptyBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { streamer } = req as AuthenticatedRequest;

      const dbStreamer = await prisma.streamer.findUnique({
        where: { id: streamer.id },
        select: { telegramUserId: true },
      });

      if (dbStreamer?.telegramUserId) {
        res.json({
          telegramLink: { linked: true, message: 'Telegram account is already linked' },
        });
        return;
      }

      const token = randomBytes(16).toString('hex');
      await redis.setex(LINK_TOKEN_PREFIX + token, LINK_TOKEN_TTL, streamer.id);

      const deepLink = `https://t.me/${getBotUsername()}?start=link_${token}`;

      res.json({
        telegramLink: { linked: false, deepLink, expiresIn: LINK_TOKEN_TTL },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/telegram-unlink — Unlink Telegram account from streamer.
 */
router.post(
  '/telegram-unlink',
  requireAuth,
  validate(emptyBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { streamer } = req as AuthenticatedRequest;

      const dbStreamer = await prisma.streamer.findUnique({
        where: { id: streamer.id },
        select: { telegramUserId: true },
      });

      if (!dbStreamer?.telegramUserId) {
        res.json({ ok: true });
        return;
      }

      await prisma.streamer.update({
        where: { id: streamer.id },
        data: { telegramUserId: null },
      });

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/sync — Force-refresh streamer profile from MemeLab.
 * Busts Redis auth cache and re-syncs platforms from memelab.ru.
 * Returns available external accounts for the platform picker.
 */
router.post(
  '/sync',
  requireAuth,
  validate(emptyBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractToken(req);
      if (!token) {
        throw AppError.unauthorized();
      }

      // Bust cache
      await redis.del(AUTH_CACHE_PREFIX + hashToken(token));

      // Re-fetch and upsert
      const fetchResult = await fetchMemelabProfile(token);
      if (!fetchResult.profile || !fetchResult.profile.channel) {
        throw AppError.badGateway('Could not fetch profile from MemeLab');
      }

      type ProfileWithChannel = typeof fetchResult.profile & {
        channel: NonNullable<typeof fetchResult.profile.channel>;
      };
      await upsertStreamerFromProfile(fetchResult.profile as ProfileWithChannel);

      // Return available accounts for platform picker
      const availableAccounts = fetchResult.profile.externalAccounts
        .filter((acc) => acc.login && PROVIDER_TO_PLATFORM[acc.provider])
        .map((acc) => ({
          platform: PROVIDER_TO_PLATFORM[acc.provider]!,
          login: acc.login!,
          displayName: acc.displayName ?? acc.login!,
        }));

      res.json({ availableAccounts });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/auth/available-platforms — List external accounts from MemeLab profile.
 * Returns accounts that can be added as stream platforms.
 */
router.get(
  '/available-platforms',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractToken(req);
      if (!token) {
        throw AppError.unauthorized();
      }

      // Read cached profile (requireAuth already populated it)
      const cached = await redis.get(AUTH_CACHE_PREFIX + hashToken(token));
      if (!cached) {
        throw AppError.badGateway('Profile not available');
      }

      const profile = JSON.parse(cached) as MemelabUserProfile;
      const availableAccounts = profile.externalAccounts
        .filter((acc) => acc.login && PROVIDER_TO_PLATFORM[acc.provider])
        .map((acc) => ({
          platform: PROVIDER_TO_PLATFORM[acc.provider]!,
          login: acc.login!,
          displayName: acc.displayName ?? acc.login!,
        }));

      res.json({ availableAccounts });
    } catch (error) {
      next(error);
    }
  },
);

export { router as authRouter };
