import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest, MemelabUserProfile } from './types.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import { upsertStreamerFromProfile } from '../../services/streamerService.js';

const AUTH_CACHE_PREFIX = 'auth:profile:';
const AUTH_CACHE_TTL = 300; // 5 minutes

/**
 * Auth middleware: validates JWT cookie by calling MemeLab API.
 * Caches user profile in Redis for 5 minutes.
 * Upserts Streamer record on each request.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    let profile = await getCachedProfile(token);

    if (!profile) {
      profile = await fetchMemelabProfile(token);
      if (!profile) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      await cacheProfile(token, profile);
    }

    if (!profile.channelId || !profile.channel) {
      res.status(403).json({ error: 'No channel linked to your MemeLab account' });
      return;
    }

    const streamer = await upsertStreamerFromProfile(profile);
    (req as AuthenticatedRequest).streamer = streamer;

    next();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'auth.middleware_error',
    );
    res.status(500).json({ error: 'Authentication error' });
  }
}

function extractToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookieName = config.jwtCookieName;
    const regex = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`);
    const match = cookieHeader.match(regex);
    if (match) return match[1];
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

async function getCachedProfile(token: string): Promise<MemelabUserProfile | null> {
  try {
    const cached = await redis.get(AUTH_CACHE_PREFIX + hashToken(token));
    if (cached) return JSON.parse(cached);
  } catch {
    // Cache miss is fine
  }
  return null;
}

async function cacheProfile(token: string, profile: MemelabUserProfile): Promise<void> {
  try {
    await redis.setex(AUTH_CACHE_PREFIX + hashToken(token), AUTH_CACHE_TTL, JSON.stringify(profile));
  } catch {
    // Non-critical
  }
}

async function fetchMemelabProfile(token: string): Promise<MemelabUserProfile | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${config.memelabApiUrl}/v1/viewer/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'auth.memelab_api_rejected');
      return null;
    }

    return (await res.json()) as MemelabUserProfile;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'auth.memelab_api_failed',
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
