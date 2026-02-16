import type { Request } from 'express';

/** Shape returned by MemeLab API GET /api/v1/me */
export interface MemelabUserProfile {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  role: string;
  channelId: string | null;
  channel: {
    id: string;
    slug: string;
    name: string;
  } | null;
  externalAccounts: Array<{
    provider: string;
    providerAccountId: string;
    displayName: string | null;
    login: string | null;
    avatarUrl: string | null;
  }>;
}

/** Streamer data attached to authenticated requests */
export interface AuthStreamer {
  id: string;
  memelabUserId: string;
  memelabChannelId: string;
  twitchLogin: string | null;
  displayName: string;
  avatarUrl: string | null;
}

/** Extended Express Request with auth data */
export interface AuthenticatedRequest extends Request {
  streamer: AuthStreamer;
}
