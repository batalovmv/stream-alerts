import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/types.js';
import { config } from '../../lib/config.js';

const router: RouterType = Router();

const MEMELAB_LOGIN_URL = config.isDev
  ? 'http://localhost:3001/login'
  : 'https://memelab.ru/login';

/**
 * GET /api/auth/me — Return current authenticated streamer.
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const { streamer } = req as AuthenticatedRequest;
  res.json({
    user: {
      id: streamer.id,
      memelabUserId: streamer.memelabUserId,
      displayName: streamer.displayName,
      avatarUrl: streamer.avatarUrl,
      twitchLogin: streamer.twitchLogin,
      channelId: streamer.memelabChannelId,
    },
  });
});

/**
 * GET /api/auth/login — Redirect to MemeLab login page.
 * Since we use shared cookies on .memelab.ru, the user just logs in on memelab.ru.
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

export { router as authRouter };
