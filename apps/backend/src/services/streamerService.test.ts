/**
 * Tests for streamerService — upsertStreamerFromProfile logic.
 *
 * Mock strategy:
 * - prisma: vi.mock with findUnique + upsert stubs
 * - logger: vi.mock (silent)
 * - streamPlatforms: use REAL implementation (pure, deterministic, no I/O)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    streamer: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────

import { prisma } from '../lib/prisma.js';
import { upsertStreamerFromProfile } from './streamerService.js';
import type { MemelabUserProfile } from '../api/middleware/types.js';

// ─── Typed mock aliases ───────────────────────────────────────

const mockFindUnique = prisma.streamer.findUnique as Mock;
const mockUpsert = prisma.streamer.upsert as Mock;

// ─── Fixture factories ────────────────────────────────────────

type ProfileOverrides = Partial<
  Omit<MemelabUserProfile, 'channel' | 'externalAccounts'> & {
    channel: Partial<NonNullable<MemelabUserProfile['channel']>>;
    externalAccounts: MemelabUserProfile['externalAccounts'];
  }
>;

function makeProfile(overrides: ProfileOverrides = {}): MemelabUserProfile & {
  channel: NonNullable<MemelabUserProfile['channel']>;
} {
  const base: MemelabUserProfile = {
    id: 'user-1',
    displayName: 'StreamerName',
    profileImageUrl: 'https://cdn.example.com/avatar.png',
    role: 'streamer',
    channelId: 'chan-1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel: { id: 'chan-1', slug: 'streamername', name: 'StreamerName', ...overrides.channel } as any,
    externalAccounts: overrides.externalAccounts ?? [
      {
        provider: 'twitch',
        providerAccountId: 'twitch-123',
        displayName: 'StreamerName',
        login: 'streamername',
        avatarUrl: null,
      },
    ],
    ...overrides,
  };

  return base as MemelabUserProfile & {
    channel: NonNullable<MemelabUserProfile['channel']>;
  };
}

function makeDbStreamer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'streamer-db-1',
    memelabUserId: 'user-1',
    memelabChannelId: 'chan-1',
    channelSlug: 'streamername',
    twitchLogin: 'streamername',
    displayName: 'StreamerName',
    avatarUrl: 'https://cdn.example.com/avatar.png',
    streamPlatforms: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('upsertStreamerFromProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Slug validation ──────────────────────────────────────

  describe('slug validation', () => {
    it('throws "Invalid channel slug" when slug exceeds 100 characters', async () => {
      const profile = makeProfile({ channel: { slug: 'a'.repeat(101) } });

      await expect(upsertStreamerFromProfile(profile)).rejects.toThrow('Invalid channel slug');
      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('throws "Invalid channel slug" for slug with invalid characters', async () => {
      const profile = makeProfile({ channel: { slug: 'bad slug!' } });

      await expect(upsertStreamerFromProfile(profile)).rejects.toThrow('Invalid channel slug');
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('throws "Invalid channel slug" for slug with spaces', async () => {
      const profile = makeProfile({ channel: { slug: 'has space' } });

      await expect(upsertStreamerFromProfile(profile)).rejects.toThrow('Invalid channel slug');
    });

    it('accepts a valid slug at exactly 100 characters', async () => {
      const slug = 'a'.repeat(100);
      const profile = makeProfile({ channel: { slug } });
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer({ channelSlug: slug }));

      await expect(upsertStreamerFromProfile(profile)).resolves.not.toThrow();
    });
  });

  // ── 2. First-time streamer (no existing record) ─────────────

  describe('first-time streamer', () => {
    it('upserts with all OAuth platforms mapped when no existing record', async () => {
      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'twitch',
            providerAccountId: 'tw-1',
            displayName: 'StreamerName',
            login: 'streamername',
            avatarUrl: null,
          },
          {
            provider: 'youtube',
            providerAccountId: 'yt-1',
            displayName: 'StreamerName YT',
            login: 'streamername_yt',
            avatarUrl: null,
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      expect(mockUpsert).toHaveBeenCalledOnce();
      const call = mockUpsert.mock.calls[0][0];
      const platforms: Array<{ platform: string; login: string; url: string; isManual: boolean }> =
        call.create.streamPlatforms;

      expect(platforms).toHaveLength(2);
      expect(platforms[0]).toMatchObject({
        platform: 'twitch',
        login: 'streamername',
        url: 'https://twitch.tv/streamername',
        isManual: false,
      });
      expect(platforms[1]).toMatchObject({
        platform: 'youtube',
        login: 'streamername_yt',
        url: 'https://youtube.com/@streamername_yt',
        isManual: false,
      });
    });

    it('uses twitchAccount login as twitchLogin and avatarUrl from profileImageUrl', async () => {
      const profile = makeProfile({
        profileImageUrl: 'https://cdn.example.com/me.png',
        externalAccounts: [
          {
            provider: 'twitch',
            providerAccountId: 'tw-1',
            displayName: 'StreamerName',
            login: 'streamername',
            avatarUrl: 'https://cdn.twitch.com/avatar.png',
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.twitchLogin).toBe('streamername');
      expect(call.create.avatarUrl).toBe('https://cdn.example.com/me.png');
    });

    it('falls back to twitchAccount avatarUrl when profileImageUrl is null', async () => {
      const profile = makeProfile({
        profileImageUrl: null,
        externalAccounts: [
          {
            provider: 'twitch',
            providerAccountId: 'tw-1',
            displayName: 'StreamerName',
            login: 'streamername',
            avatarUrl: 'https://cdn.twitch.com/fallback.png',
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer({ avatarUrl: 'https://cdn.twitch.com/fallback.png' }));

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.avatarUrl).toBe('https://cdn.twitch.com/fallback.png');
    });

    it('sets twitchLogin to null when no twitch account in profile', async () => {
      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'youtube',
            providerAccountId: 'yt-1',
            displayName: null,
            login: 'ytchannel',
            avatarUrl: null,
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer({ twitchLogin: null }));

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.twitchLogin).toBeNull();
    });
  });

  // ── 3. Existing streamer with platforms — merge logic ───────

  describe('existing streamer with platforms', () => {
    it('preserves manual platforms and updates OAuth URL data', async () => {
      const existingPlatforms = [
        {
          platform: 'twitch',
          login: 'streamername',
          url: 'https://twitch.tv/streamername',
          isManual: false,
        },
        {
          platform: 'other',
          login: 'custom-stream',
          url: 'https://custom.stream/channel',
          isManual: true,
        },
      ];

      mockFindUnique.mockResolvedValue(
        makeDbStreamer({ streamPlatforms: existingPlatforms }),
      );
      mockUpsert.mockResolvedValue(makeDbStreamer());

      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'twitch',
            providerAccountId: 'tw-1',
            displayName: 'StreamerName',
            login: 'streamername',
            avatarUrl: null,
          },
        ],
      });

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      const platforms: Array<{ platform: string; isManual: boolean }> =
        call.update.streamPlatforms;

      // Both entries preserved
      expect(platforms).toHaveLength(2);

      const twitch = platforms.find((p) => p.platform === 'twitch');
      expect(twitch).toMatchObject({ isManual: false });

      const manual = platforms.find((p) => p.platform === 'other');
      expect(manual).toMatchObject({
        login: 'custom-stream',
        url: 'https://custom.stream/channel',
        isManual: true,
      });
    });

    it('does NOT auto-add new OAuth platforms to an existing streamer', async () => {
      const existingPlatforms = [
        {
          platform: 'twitch',
          login: 'streamername',
          url: 'https://twitch.tv/streamername',
          isManual: false,
        },
      ];

      mockFindUnique.mockResolvedValue(
        makeDbStreamer({ streamPlatforms: existingPlatforms }),
      );
      mockUpsert.mockResolvedValue(makeDbStreamer());

      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'twitch',
            providerAccountId: 'tw-1',
            displayName: 'StreamerName',
            login: 'streamername',
            avatarUrl: null,
          },
          // New YouTube account appeared in OAuth but should NOT be auto-added
          {
            provider: 'youtube',
            providerAccountId: 'yt-1',
            displayName: null,
            login: 'newytchannel',
            avatarUrl: null,
          },
        ],
      });

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      const platforms: Array<{ platform: string }> = call.update.streamPlatforms;

      // Only twitch should remain — youtube was NOT auto-added
      expect(platforms).toHaveLength(1);
      expect(platforms[0].platform).toBe('twitch');
    });

    it('keeps existing OAuth platform entry even when OAuth account removed from profile', async () => {
      const existingPlatforms = [
        {
          platform: 'twitch',
          login: 'streamername',
          url: 'https://twitch.tv/streamername',
          isManual: false,
        },
      ];

      mockFindUnique.mockResolvedValue(
        makeDbStreamer({ streamPlatforms: existingPlatforms }),
      );
      mockUpsert.mockResolvedValue(makeDbStreamer());

      // OAuth profile no longer has twitch
      const profile = makeProfile({ externalAccounts: [] });

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      const platforms: Array<{ platform: string; login: string }> =
        call.update.streamPlatforms;

      expect(platforms).toHaveLength(1);
      expect(platforms[0]).toMatchObject({ platform: 'twitch', login: 'streamername' });
    });
  });

  // ── 4. Google provider → youtube platform ──────────────────

  describe('provider mapping', () => {
    it('maps "google" provider to "youtube" platform', async () => {
      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'google',
            providerAccountId: 'google-1',
            displayName: 'My Channel',
            login: 'mychannelhandle',
            avatarUrl: null,
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      const platforms: Array<{ platform: string; url: string }> = call.create.streamPlatforms;

      expect(platforms).toHaveLength(1);
      expect(platforms[0].platform).toBe('youtube');
      expect(platforms[0].url).toBe('https://youtube.com/@mychannelhandle');
    });

    it('maps vk and kick providers to their respective platforms', async () => {
      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'vk',
            providerAccountId: 'vk-1',
            displayName: null,
            login: 'vk_user',
            avatarUrl: null,
          },
          {
            provider: 'kick',
            providerAccountId: 'kick-1',
            displayName: null,
            login: 'kick_user',
            avatarUrl: null,
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      const platforms: Array<{ platform: string; url: string }> = call.create.streamPlatforms;

      expect(platforms).toHaveLength(2);
      expect(platforms.find((p) => p.platform === 'vk')?.url).toBe(
        'https://vk.com/video/@vk_user/videos',
      );
      expect(platforms.find((p) => p.platform === 'kick')?.url).toBe(
        'https://kick.com/kick_user',
      );
    });

    it('ignores unknown providers', async () => {
      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'discord',
            providerAccountId: 'discord-1',
            displayName: null,
            login: 'discorduser',
            avatarUrl: null,
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.streamPlatforms).toHaveLength(0);
    });
  });

  // ── 5. Accounts with null login → filtered out ──────────────

  describe('null login filtering', () => {
    it('filters out OAuth accounts with null login', async () => {
      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'twitch',
            providerAccountId: 'tw-1',
            displayName: 'StreamerName',
            login: 'streamername',
            avatarUrl: null,
          },
          {
            provider: 'youtube',
            providerAccountId: 'yt-1',
            displayName: 'YouTube',
            login: null, // should be filtered out
            avatarUrl: null,
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      const platforms: Array<{ platform: string }> = call.create.streamPlatforms;

      expect(platforms).toHaveLength(1);
      expect(platforms[0].platform).toBe('twitch');
    });

    it('produces no platforms when all accounts have null logins', async () => {
      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'twitch',
            providerAccountId: 'tw-1',
            displayName: null,
            login: null,
            avatarUrl: null,
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.streamPlatforms).toHaveLength(0);
    });
  });

  // ── 6. Prisma upsert called with correct shape ──────────────

  describe('prisma upsert call shape', () => {
    it('passes memelabUserId as where clause for both create and update', async () => {
      const profile = makeProfile();
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      expect(call.where).toEqual({ memelabUserId: 'user-1' });
      expect(call.create.memelabUserId).toBe('user-1');
    });

    it('includes channelSlug and memelabChannelId in create and update', async () => {
      const profile = makeProfile({
        channel: { id: 'chan-42', slug: 'valid-slug' },
      });
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      expect(call.create.channelSlug).toBe('valid-slug');
      expect(call.create.memelabChannelId).toBe('chan-42');
      expect(call.update.channelSlug).toBe('valid-slug');
      expect(call.update.memelabChannelId).toBe('chan-42');
    });

    it('update data does NOT include memelabUserId', async () => {
      const profile = makeProfile();
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      expect(call.update).not.toHaveProperty('memelabUserId');
    });

    it('returns AuthStreamer shape from the upserted row', async () => {
      const profile = makeProfile();
      const dbRow = makeDbStreamer({
        id: 'streamer-abc',
        memelabUserId: 'user-1',
        memelabChannelId: 'chan-1',
        channelSlug: 'streamername',
        twitchLogin: 'streamername',
        displayName: 'StreamerName',
        avatarUrl: 'https://cdn.example.com/avatar.png',
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(dbRow);

      const result = await upsertStreamerFromProfile(profile);

      expect(result).toEqual({
        id: 'streamer-abc',
        memelabUserId: 'user-1',
        memelabChannelId: 'chan-1',
        channelSlug: 'streamername',
        twitchLogin: 'streamername',
        displayName: 'StreamerName',
        avatarUrl: 'https://cdn.example.com/avatar.png',
      });
    });

    it('deduplicates platforms with the same platform:login key on first-time setup', async () => {
      // Two accounts with same provider+login (shouldn't normally happen but guard it)
      const profile = makeProfile({
        externalAccounts: [
          {
            provider: 'twitch',
            providerAccountId: 'tw-1',
            displayName: 'A',
            login: 'streamername',
            avatarUrl: null,
          },
          {
            provider: 'twitch',
            providerAccountId: 'tw-2',
            displayName: 'B',
            login: 'streamername',
            avatarUrl: null,
          },
        ],
      });

      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(makeDbStreamer());

      await upsertStreamerFromProfile(profile);

      const call = mockUpsert.mock.calls[0][0];
      const platforms: Array<{ platform: string; login: string }> = call.create.streamPlatforms;

      expect(platforms).toHaveLength(1);
      expect(platforms[0]).toMatchObject({ platform: 'twitch', login: 'streamername' });
    });
  });
});
