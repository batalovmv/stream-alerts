import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { MemelabUserProfile, AuthStreamer } from '../api/middleware/types.js';

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

  const data = {
    memelabChannelId: profile.channel.id,
    channelSlug: profile.channel.slug,
    twitchLogin: twitchAccount?.login ?? null,
    displayName: profile.displayName,
    avatarUrl: profile.profileImageUrl ?? twitchAccount?.avatarUrl ?? null,
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
    { streamerId: streamer.id, memelabUserId: profile.id },
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
