/**
 * Compact human-readable relative-time formatter used by sig TTLs and the
 * connection EOL countdown. Pure (no `Date.now()` dependency at the call site
 * is the caller's responsibility — pass the already-computed delta in).
 *
 * Rounding follows the legacy `system_signature.js` table renderer: hours
 * rounded to the nearest hour up to 24h, then days rounded to the nearest day.
 */
export function formatRelativeFromMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  const hours = Math.round(ms / 3_600_000);
  if (hours <= 0) return 'expired';
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
