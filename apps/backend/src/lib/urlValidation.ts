/**
 * URL validation utilities.
 *
 * Provides safe URL validation to prevent SSRF and XSS attacks
 * via user-provided URLs (stream platforms, custom buttons, etc.).
 */

/** Blocked protocols that could lead to XSS or SSRF */
const BLOCKED_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'file:']);

/** Blocked hosts that target internal infrastructure */
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

/** Blocked IP ranges (private/internal networks) */
const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // link-local
];

/**
 * Validate a user-provided URL for safety.
 *
 * Returns true if the URL is safe to store and use, false otherwise.
 * Checks against: blocked protocols, internal hosts, private IPs.
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow http/https protocols
    if (BLOCKED_PROTOCOLS.has(parsed.protocol)) return false;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    // Block internal/private hosts
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(hostname)) return false;

    // Block private IP ranges
    if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname))) return false;

    return true;
  } catch {
    return false;
  }
}
