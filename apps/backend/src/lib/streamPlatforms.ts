/**
 * Stream platform types and utilities.
 *
 * Streamers can connect multiple platforms (Twitch, YouTube, VK, Kick, etc.).
 * Platforms are auto-synced from MemeLab OAuth and can be added/edited manually.
 */

export interface StreamPlatform {
  /** Platform identifier */
  platform: 'twitch' | 'youtube' | 'vk' | 'kick' | 'other';
  /** Login / channel ID on the platform */
  login: string;
  /** Full URL to the stream/channel */
  url: string;
  /** If true, was added manually — don't overwrite on OAuth sync */
  isManual: boolean;
}

export interface CustomButton {
  /** Button text (supports template variables) */
  label: string;
  /** Button URL (supports template variables like {twitch_url}) */
  url: string;
}

/** Known platform → URL template mapping */
const PLATFORM_URL_TEMPLATES: Record<string, (login: string) => string> = {
  twitch: (login) => `https://twitch.tv/${login}`,
  youtube: (login) => `https://youtube.com/@${login}`,
  vk: (login) => `https://vk.com/video/@${login}/videos`,
  kick: (login) => `https://kick.com/${login}`,
};

/** Build a platform URL from login. Returns the login as-is for unknown platforms. */
export function buildPlatformUrl(platform: string, login: string): string {
  const template = PLATFORM_URL_TEMPLATES[platform];
  return template ? template(login) : login;
}

/** Validate and parse streamPlatforms JSON from database. */
export function parseStreamPlatforms(json: unknown): StreamPlatform[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (p): p is StreamPlatform =>
      typeof p === 'object' &&
      p !== null &&
      typeof p.platform === 'string' &&
      typeof p.login === 'string' &&
      typeof p.url === 'string' &&
      typeof p.isManual === 'boolean',
  );
}

/** Validate and parse customButtons JSON from database. */
export function parseCustomButtons(json: unknown): CustomButton[] | null {
  if (json === null || json === undefined) return null;
  if (!Array.isArray(json)) return null;
  return json.filter(
    (b): b is CustomButton =>
      typeof b === 'object' &&
      b !== null &&
      typeof b.label === 'string' &&
      typeof b.url === 'string' &&
      b.label.trim().length > 0 &&
      b.url.trim().length > 0,
  );
}

/** Get URL for a specific platform from the platforms list. */
export function getPlatformUrl(platforms: StreamPlatform[], platform: string): string | undefined {
  return platforms.find((p) => p.platform === platform)?.url;
}

/** Get the "primary" stream URL — first platform by priority. */
export function getPrimaryStreamUrl(platforms: StreamPlatform[]): string | undefined {
  const priority = ['twitch', 'youtube', 'vk', 'kick', 'other'];
  for (const p of priority) {
    const url = getPlatformUrl(platforms, p);
    if (url) return url;
  }
  return undefined;
}
