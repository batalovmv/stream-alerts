/**
 * Tests for auth middleware — token extraction, hashing, requireAuth flow,
 * and fetchMemelabProfile.
 *
 * Mock strategy:
 * - config: vi.mock with memelabApiUrl, jwtCookieName, isDev
 * - logger: vi.mock (silent)
 * - redis: vi.mock with get/setex stubs
 * - prisma: vi.mock with streamer.findUnique / streamer.upsert stubs
 * - upsertStreamerFromProfile: vi.mock
 * - global.fetch: vi.stubGlobal
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

// ─── Mocks ────────────────────────────────────────────────────

vi.mock('../../lib/config.js', () => ({
  config: {
    memelabApiUrl: 'https://api.memelab.test',
    jwtCookieName: 'memelab_jwt',
    isDev: false,
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
  },
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    streamer: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../../services/streamerService.js', () => ({
  upsertStreamerFromProfile: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────

import { requireAuth, extractToken, hashToken, fetchMemelabProfile, AUTH_CACHE_PREFIX } from './auth.js';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { upsertStreamerFromProfile } from '../../services/streamerService.js';

// ─── Helpers ──────────────────────────────────────────────────

function createMockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    headers: {},
    ...overrides,
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

/** Minimal valid MemeLab profile returned by the API */
const validProfile = {
  id: 'user-123',
  displayName: 'TestStreamer',
  profileImageUrl: null,
  role: 'user',
  channelId: 'chan-456',
  channel: { id: 'chan-456', slug: 'teststreamer', name: 'TestStreamer' },
  externalAccounts: [],
};

/** Profile that has no channel linked */
const noChannelProfile = {
  ...validProfile,
  channelId: null,
  channel: null,
};

/** Minimal AuthStreamer returned by upsertStreamerFromProfile */
const validStreamer = {
  id: 'streamer-db-1',
  memelabUserId: 'user-123',
  memelabChannelId: 'chan-456',
  channelSlug: 'teststreamer',
  twitchLogin: null,
  displayName: 'TestStreamer',
  avatarUrl: null,
};

// ─── extractToken ─────────────────────────────────────────────

describe('extractToken', () => {
  it('returns token from cookie header', () => {
    const { req } = createMockReqRes({
      headers: { cookie: 'memelab_jwt=my-token-value; other=foo' },
    } as Partial<Request>);
    expect(extractToken(req)).toBe('my-token-value');
  });

  it('URL-decodes token value from cookie', () => {
    const { req } = createMockReqRes({
      headers: { cookie: 'memelab_jwt=my%20token%3Dvalue' },
    } as Partial<Request>);
    expect(extractToken(req)).toBe('my token=value');
  });

  it('returns token from Bearer Authorization header', () => {
    const { req } = createMockReqRes({
      headers: { authorization: 'Bearer bearer-token-abc' },
    } as Partial<Request>);
    expect(extractToken(req)).toBe('bearer-token-abc');
  });

  it('prefers cookie over Authorization header when both present', () => {
    const { req } = createMockReqRes({
      headers: {
        cookie: 'memelab_jwt=cookie-token',
        authorization: 'Bearer bearer-token',
      },
    } as Partial<Request>);
    expect(extractToken(req)).toBe('cookie-token');
  });

  it('returns null when neither cookie nor Authorization header present', () => {
    const { req } = createMockReqRes({ headers: {} } as Partial<Request>);
    expect(extractToken(req)).toBeNull();
  });

  it('returns null when Authorization header is not Bearer scheme', () => {
    const { req } = createMockReqRes({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    } as Partial<Request>);
    expect(extractToken(req)).toBeNull();
  });

  it('returns null when cookie header exists but does not contain the configured cookie name', () => {
    const { req } = createMockReqRes({
      headers: { cookie: 'other_cookie=abc; another=xyz' },
    } as Partial<Request>);
    expect(extractToken(req)).toBeNull();
  });
});

// ─── hashToken ────────────────────────────────────────────────

describe('hashToken', () => {
  it('returns a hex SHA-256 hash of the token', () => {
    const token = 'my-secret-token';
    const expected = createHash('sha256').update(token).digest('hex');
    expect(hashToken(token)).toBe(expected);
  });

  it('is deterministic — same input always produces same output', () => {
    const token = 'deterministic-token';
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('returns a 64-character hex string (256 bits)', () => {
    expect(hashToken('any-token')).toHaveLength(64);
  });
});

// ─── requireAuth ──────────────────────────────────────────────

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no token is present', async () => {
    const { req, res, next } = createMockReqRes({ headers: {} } as Partial<Request>);
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as Mock)).toHaveBeenCalledWith({ error: 'Not authenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('uses cached profile from Redis, calls findUnique, sets req.streamer and calls next()', async () => {
    const token = 'cached-token';
    (redis.get as Mock).mockResolvedValueOnce(JSON.stringify(validProfile));
    (prisma.streamer.findUnique as Mock).mockResolvedValueOnce(validStreamer);

    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    } as Partial<Request>);

    await requireAuth(req, res, next);

    const expectedKey = AUTH_CACHE_PREFIX + hashToken(token);
    expect(redis.get).toHaveBeenCalledWith(expectedKey);
    expect(prisma.streamer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memelabUserId: validProfile.id } }),
    );
    expect(upsertStreamerFromProfile).not.toHaveBeenCalled();
    expect((req as any).streamer).toEqual(validStreamer);
    expect(next).toHaveBeenCalled();
  });

  it('falls back to upsert when cache hit but streamer not in DB', async () => {
    const token = 'cached-no-db-token';
    (redis.get as Mock).mockResolvedValueOnce(JSON.stringify(validProfile));
    (prisma.streamer.findUnique as Mock).mockResolvedValueOnce(null);
    (upsertStreamerFromProfile as Mock).mockResolvedValueOnce(validStreamer);

    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    } as Partial<Request>);

    await requireAuth(req, res, next);

    expect(upsertStreamerFromProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: validProfile.id }),
    );
    expect((req as any).streamer).toEqual(validStreamer);
    expect(next).toHaveBeenCalled();
  });

  it('fetches fresh profile on cache miss, caches it, upserts streamer, calls next()', async () => {
    const token = 'fresh-token';
    (redis.get as Mock).mockResolvedValueOnce(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => validProfile,
      }),
    );
    (redis.setex as Mock).mockResolvedValueOnce('OK');
    (upsertStreamerFromProfile as Mock).mockResolvedValueOnce(validStreamer);

    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    } as Partial<Request>);

    await requireAuth(req, res, next);

    expect(redis.get).toHaveBeenCalled();
    expect(redis.setex).toHaveBeenCalledWith(
      AUTH_CACHE_PREFIX + hashToken(token),
      300,
      JSON.stringify(validProfile),
    );
    expect(upsertStreamerFromProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: validProfile.id }),
    );
    expect(prisma.streamer.findUnique).not.toHaveBeenCalled();
    expect((req as any).streamer).toEqual(validStreamer);
    expect(next).toHaveBeenCalled();
  });

  it('returns 503 when fetchMemelabProfile returns network error', async () => {
    const token = 'net-err-token';
    (redis.get as Mock).mockResolvedValueOnce(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')),
    );

    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    } as Partial<Request>);

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect((res.json as Mock)).toHaveBeenCalledWith({
      error: 'Authentication service temporarily unavailable',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when fetchMemelabProfile returns rejected error', async () => {
    const token = 'rejected-token';
    (redis.get as Mock).mockResolvedValueOnce(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    );

    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    } as Partial<Request>);

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as Mock)).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when profile has no channelId/channel', async () => {
    const token = 'no-channel-token';
    (redis.get as Mock).mockResolvedValueOnce(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => noChannelProfile,
      }),
    );
    (redis.setex as Mock).mockResolvedValueOnce('OK');

    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    } as Partial<Request>);

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.json as Mock)).toHaveBeenCalledWith({
      error: 'No channel linked to your MemeLab account',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when cached profile has no channelId/channel', async () => {
    const token = 'cached-no-channel-token';
    (redis.get as Mock).mockResolvedValueOnce(JSON.stringify(noChannelProfile));

    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    } as Partial<Request>);

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when an unexpected error is thrown', async () => {
    const token = 'boom-token';
    (redis.get as Mock).mockRejectedValueOnce(new Error('Redis exploded'));
    // getCachedProfile swallows errors and returns null; trigger the throw
    // from prisma instead via the fresh-fetch path
    (redis.get as Mock).mockResolvedValueOnce(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => validProfile,
      }),
    );
    (redis.setex as Mock).mockResolvedValueOnce('OK');
    (upsertStreamerFromProfile as Mock).mockRejectedValueOnce(new Error('DB down'));

    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    } as Partial<Request>);

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json as Mock)).toHaveBeenCalledWith({ error: 'Authentication error' });
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── fetchMemelabProfile ──────────────────────────────────────

describe('fetchMemelabProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed profile on successful fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => validProfile,
      }),
    );

    const result = await fetchMemelabProfile('good-token');

    expect(result.profile).toEqual(validProfile);
    expect(result.error).toBeUndefined();
  });

  it('sends Authorization Bearer header with the token', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => validProfile,
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetchMemelabProfile('my-auth-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.memelab.test/v1/me',
      expect.objectContaining({
        headers: { Authorization: 'Bearer my-auth-token' },
      }),
    );
  });

  it('returns { profile: null, error: "rejected" } on HTTP non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
      }),
    );

    const result = await fetchMemelabProfile('bad-token');

    expect(result).toEqual({ profile: null, error: 'rejected' });
  });

  it('returns { profile: null, error: "network" } on network/fetch error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );

    const result = await fetchMemelabProfile('network-fail-token');

    expect(result).toEqual({ profile: null, error: 'network' });
  });

  it('returns { profile: null, error: "network" } when AbortController times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
      ),
    );

    const result = await fetchMemelabProfile('timeout-token');

    expect(result).toEqual({ profile: null, error: 'network' });
  });

  it('returns { profile: null, error: "network" } when API response fails Zod validation', async () => {
    const malformedProfile = { id: '', displayName: 123, role: 'user' }; // missing required fields
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => malformedProfile,
      }),
    );

    const result = await fetchMemelabProfile('schema-mismatch-token');

    expect(result).toEqual({ profile: null, error: 'network' });
  });
});
