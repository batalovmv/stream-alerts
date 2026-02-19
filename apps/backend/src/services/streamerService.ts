import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { buildPlatformUrl, parseStreamPlatforms } from '../lib/streamPlatforms.js';
import type { StreamPlatform } from '../lib/streamPlatforms.js';
import type { MemelabUserProfile, AuthStreamer } from '../api/middleware/types.js';

/** Map MemeLab OAuth provider names to our platform identifiers */
const PROVIDER_TO_PLATFORM: Record<string, StreamPlatform['platform']> = {
  twitch: 'twitch',
  youtube: 'youtube',
  google: 'youtube', // MemeLab might use 'google' for YouTube OAuth
  vk: 'vk',
  kick: 'kick',
};

/**
 * Merge OAuth-synced platforms with existing manual platforms.
 *
 * - OAuth platforms are updated/added (isManual: false)
 * - Manual platforms (isManual: true) are preserved as-is
 * - OAuth platforms that no longer exist in the profile are removed
 */
function mergeStreamPlatforms(
  existing: StreamPlatform[],
  oauthAccounts: MemelabUserProfile['externalAccounts'],
): StreamPlatform[] {
  const manualPlatforms = existing.filter((p) => p.isManual);

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

  // Combine: OAuth platforms first, then manual ones (skip duplicates by platform+login)
  const seen = new Set<string>();
  const merged: StreamPlatform[] = [];

  for (const p of oauthPlatforms) {
    const key = `${p.platform}:${p.login}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(p);
    }
  }

  for (const p of manualPlatforms) {
    const key = `${p.platform}:${p.login}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(p);
    }
  }

  return merged;
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

  // Load existing streamer to preserve manual platforms
  const existingStreamer = await prisma.streamer.findUnique({
    where: { memelabUserId: profile.id },
    select: { streamPlatforms: true },
  });

  const existingPlatforms = parseStreamPlatforms(existingStreamer?.streamPlatforms);
  const mergedPlatforms = mergeStreamPlatforms(existingPlatforms, profile.externalAccounts);

  const data = {
    memelabChannelId: profile.channel.id,
    channelSlug: profile.channel.slug,
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
