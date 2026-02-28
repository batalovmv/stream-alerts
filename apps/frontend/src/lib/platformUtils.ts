/** Known platform → URL template mapping (mirrors backend) */
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
