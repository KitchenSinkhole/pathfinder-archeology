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

/**
 * Renders how long ago a past timestamp was. The counterpart to
 * `formatRelativeFromMs` (which is a forward countdown). Sub-minute deltas
 * render `"just now"`. Units floor (not round) to match "ago" semantics — a
 * 90-minute delta reads `"1 hour ago"`, never `"2 hours ago"`.
 *
 * @param ms — elapsed milliseconds (caller computes `Date.now() - ts`).
 * @param style — `"compact"` (`"5m ago"`, default) or `"long"` (`"5 minutes ago"`).
 */
export function formatAgoFromMs(ms: number, style: 'compact' | 'long' = 'compact'): string {
  if (!Number.isFinite(ms) || ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return agoUnit(minutes, 'm', 'minute', style);
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return agoUnit(hours, 'h', 'hour', style);
  const days = Math.floor(ms / 86_400_000);
  if (days < 7) return agoUnit(days, 'd', 'day', style);
  return agoUnit(Math.floor(days / 7), 'w', 'week', style);
}

function agoUnit(n: number, short: string, long: string, style: 'compact' | 'long'): string {
  if (style === 'compact') return `${n}${short} ago`;
  return `${n} ${long}${n === 1 ? '' : 's'} ago`;
}
