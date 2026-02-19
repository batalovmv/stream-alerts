/** Validate that a deep link URL points to t.me (Telegram) */
export function isSafeDeepLink(url: string): boolean {
  try {
    return new URL(url).hostname === 't.me';
  } catch {
    return false;
  }
}
