import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest, AuthStreamer, MemelabUserProfile } from './types.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { upsertStreamerFromProfile } from '../../services/streamerService.js';

const AUTH_CACHE_PREFIX = 'auth:profile:';
const AUTH_CACHE_TTL = 300; // 5 minutes

/**
 * Auth middleware: validates JWT cookie by calling MemeLab API.
 * Caches user profile in Redis for 5 minutes.
 * Upserts Streamer record only on fresh profile fetch; uses findUnique when serving from cache.
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
    let fromCache = !!profile;

    if (!profile) {
      const fetchResult = await fetchMemelabProfile(token);
      if (fetchResult.error === 'network') {
        res.status(503).json({ error: 'Authentication service temporarily unavailable' });
        return;
      }
      if (!fetchResult.profile) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      profile = fetchResult.profile;
      await cacheProfile(token, profile);
    }

    if (!profile.channelId || !profile.channel) {
      res.status(403).json({ error: 'No channel linked to your MemeLab account' });
      return;
    }

    // channel is guaranteed non-null after the guard above
    type ProfileWithChannel = typeof profile & { channel: NonNullable<typeof profile.channel> };
    let streamer: AuthStreamer;
    if (fromCache) {
      // Profile from cache — avoid unnecessary upsert write on every cached request
      const existing = await prisma.streamer.findUnique({
        where: { memelabUserId: profile.id },
        select: {
          id: true,
          memelabUserId: true,
          memelabChannelId: true,
          channelSlug: true,
          twitchLogin: true,
          displayName: true,
          avatarUrl: true,
        },
      });
      if (existing) {
        streamer = existing as AuthStreamer;
      } else {
        // Cache is stale (streamer not in DB) — fall back to upsert
        streamer = await upsertStreamerFromProfile(profile as ProfileWithChannel);
      }
    } else {
      streamer = await upsertStreamerFromProfile(profile as ProfileWithChannel);
    }
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

export function extractToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookieName = config.jwtCookieName;
    const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`);
    const match = cookieHeader.match(regex);
    if (match) return decodeURIComponent(match[1]);
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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

/** Zod schema for MemeLab API /v1/me response to catch upstream changes */
const memelabProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  profileImageUrl: z.string().nullable(),
  role: z.string(),
  channelId: z.string().nullable(),
  channel: z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string(),
  }).nullable(),
  externalAccounts: z.array(z.object({
    provider: z.string(),
    providerAccountId: z.string(),
    displayName: z.string().nullable(),
    login: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  })),
});

type FetchResult = { profile: MemelabUserProfile; error?: undefined } | { profile: null; error: 'rejected' | 'network' };

async function fetchMemelabProfile(token: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${config.memelabApiUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'auth.memelab_api_rejected');
      return { profile: null, error: 'rejected' };
    }

    const json = await res.json();
    const parsed = memelabProfileSchema.safeParse(json);
    if (!parsed.success) {
      logger.error({ issues: parsed.error.issues.map((i) => i.message) }, 'auth.memelab_api_invalid_response');
      return { profile: null, error: 'rejected' };
    }

    return { profile: parsed.data as MemelabUserProfile };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'auth.memelab_api_failed',
    );
    return { profile: null, error: 'network' };
  } finally {
    clearTimeout(timeout);
  }
}
