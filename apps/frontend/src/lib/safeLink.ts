/** Validate that a deep link URL points to t.me (Telegram) */
export function isSafeDeepLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 't.me';
  } catch {
    return false;
  }
}
