import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { buildPlatformUrl, parseStreamPlatforms } from '../lib/streamPlatforms.js';
import type { StreamPlatform } from '../lib/streamPlatforms.js';
import type { MemelabUserProfile, AuthStreamer } from '../api/middleware/types.js';

/** Map MemeLab OAuth provider names to our platform identifiers */
export const PROVIDER_TO_PLATFORM: Record<string, StreamPlatform['platform']> = {
  twitch: 'twitch',
  youtube: 'youtube',
  google: 'youtube', // MemeLab might use 'google' for YouTube OAuth
  vk: 'vk',
  kick: 'kick',
};

/**
 * Merge OAuth-synced platforms with existing platforms.
 *
 * First-time setup (existing is empty): all OAuth accounts are added automatically.
 * Subsequent syncs: only update URL/login data for OAuth platforms already in the list.
 * Manual platforms (isManual: true) are always preserved as-is.
 * New OAuth accounts are NOT auto-added — user must explicitly add them via the UI.
 */
function mergeStreamPlatforms(
  existing: StreamPlatform[],
  oauthAccounts: MemelabUserProfile['externalAccounts'],
): StreamPlatform[] {
  const oauthPlatforms: StreamPlatform[] = oauthAccounts
    .filter((acc) => acc.login && PROVIDER_TO_PLATFORM[acc.provider])
    .map((acc) => {
      const platform = PROVIDER_TO_PLATFORM[acc.provider]!;
      const login = acc.login!;
      return {
        platform,
        login,
        url: buildPlatformUrl(platform, login),
        isManual: false,
      };
    });

  // First-time setup: add all OAuth platforms
  if (existing.length === 0) {
    const seen = new Set<string>();
    const merged: StreamPlatform[] = [];
    for (const p of oauthPlatforms) {
      const key = `${p.platform}:${p.login}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(p);
      }
    }
    return merged;
  }

  // Subsequent syncs: only update existing OAuth entries, don't add new ones
  const oauthMap = new Map<string, StreamPlatform>();
  for (const p of oauthPlatforms) {
    oauthMap.set(`${p.platform}:${p.login}`, p);
  }

  return existing.map((p) => {
    if (p.isManual) return p;
    // Update URL if OAuth data is still available
    const fresh = oauthMap.get(`${p.platform}:${p.login}`);
    if (fresh) return { ...p, url: fresh.url };
    // OAuth account removed from profile — keep platform as user chose it
    return p;
  });
}

/**
 * Create or update a Streamer from MemeLab profile data.
 * Called on every authenticated request (idempotent).
 */
export async function upsertStreamerFromProfile(
  profile: MemelabUserProfile & { channel: NonNullable<MemelabUserProfile['channel']> },
): Promise<AuthStreamer> {
  const twitchAccount = profile.externalAccounts.find(
    (acc) => acc.provider === 'twitch',
  );
  const channelSlug = profile.channel.slug;

  if (channelSlug.length > 100 || !/^[\w-]+$/.test(channelSlug)) {
    throw new Error('Invalid channel slug');
  }

  // Load existing streamer to preserve manual platforms
  const existingStreamer = await prisma.streamer.findUnique({
    where: { memelabUserId: profile.id },
    select: { streamPlatforms: true },
  });

  const existingPlatforms = parseStreamPlatforms(existingStreamer?.streamPlatforms);
  const mergedPlatforms = mergeStreamPlatforms(existingPlatforms, profile.externalAccounts);

  const data = {
    memelabChannelId: profile.channel.id,
    channelSlug,
    twitchLogin: twitchAccount?.login ?? null,
    displayName: profile.displayName,
    avatarUrl: profile.profileImageUrl ?? twitchAccount?.avatarUrl ?? null,
    streamPlatforms: mergedPlatforms as unknown as import('@prisma/client').Prisma.InputJsonValue,
  };

  const streamer = await prisma.streamer.upsert({
    where: { memelabUserId: profile.id },
    create: {
      memelabUserId: profile.id,
      ...data,
    },
    update: data,
  });

  logger.debug(
    { streamerId: streamer.id, memelabUserId: profile.id, platformCount: mergedPlatforms.length },
    'streamer.upserted',
  );

  return {
    id: streamer.id,
    memelabUserId: streamer.memelabUserId,
    memelabChannelId: streamer.memelabChannelId,
    channelSlug: streamer.channelSlug,
    twitchLogin: streamer.twitchLogin,
    displayName: streamer.displayName,
    avatarUrl: streamer.avatarUrl,
  };
}
