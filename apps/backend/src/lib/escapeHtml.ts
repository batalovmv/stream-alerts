/**
 * Escape special HTML characters for safe embedding in Telegram HTML parse mode.
 *
 * Centralised utility — all files should import from here instead of
 * defining their own copies.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
