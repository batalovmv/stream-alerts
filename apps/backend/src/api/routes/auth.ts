import { Router, type Router as RouterType } from 'express';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

const router: RouterType = Router();

const FRONTEND_URL = config.isDev ? 'http://localhost:5173' : 'https://notify.memelab.ru';

/**
 * GET /api/auth/memelab — Redirect to MemeLab OAuth.
 */
router.get('/memelab', (_req, res) => {
  const params = new URLSearchParams({
    client_id: config.memelabClientId,
    redirect_uri: `${FRONTEND_URL}/api/auth/memelab/callback`,
    response_type: 'code',
    scope: 'profile channels',
  });

  const authUrl = `${config.memelabOAuthUrl}/authorize?${params}`;
  logger.info({ authUrl }, 'auth.redirect');
  res.redirect(authUrl);
});

/**
 * GET /api/auth/memelab/callback — OAuth callback.
 * TODO: Exchange code for token, create/update streamer, set session.
 */
router.get('/memelab/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    res.redirect(`${FRONTEND_URL}/?error=no_code`);
    return;
  }

  try {
    // TODO: Exchange authorization code for access token
    // const tokenResponse = await fetch(`${config.memelabOAuthUrl}/token`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     grant_type: 'authorization_code',
    //     code,
    //     client_id: config.memelabClientId,
    //     client_secret: config.memelabClientSecret,
    //     redirect_uri: `${FRONTEND_URL}/api/auth/memelab/callback`,
    //   }),
    // });

    // TODO: Get user info from MemeLab API
    // TODO: Create or update Streamer in database
    // TODO: Set session cookie

    logger.info({ code: String(code).slice(0, 8) + '...' }, 'auth.callback');

    // For now, redirect to dashboard (will be implemented)
    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'auth.callback_failed');
    res.redirect(`${FRONTEND_URL}/?error=auth_failed`);
  }
});

/**
 * POST /api/auth/logout — Clear session.
 */
router.post('/logout', (_req, res) => {
  // TODO: Clear session
  res.json({ ok: true });
});

/**
 * GET /api/auth/me — Get current user.
 */
router.get('/me', (_req, res) => {
  // TODO: Return current user from session
  res.status(401).json({ error: 'Not authenticated' });
});

export { router as authRouter };
