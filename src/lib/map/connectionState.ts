import { apertureConfig } from '../../../aperture.config';
import type { MapConnectionEdge } from './loadMap';

/**
 * Pure helpers that derive a wormhole connection's expiry timestamp / time
 * remaining from its `eolAt` / `createdAt` stamps + the hard-coded lifetime
 * constants in `aperture.config.ts`. Stargate / jumpbridge / abyssal scopes
 * never expire — the EOL state machine only applies to wormholes.
 *
 * These are read on the client to render the EOL countdown badge and the
 * "Expires in X" inspector hint; Stage 11's reap / EOL-expiry jobs use the
 * same constants on the server.
 */

const { WORMHOLE_EOL_LIFETIME_MS, WORMHOLE_DEFAULT_LIFETIME_MS } = apertureConfig;

/** Subset of `MapConnectionEdge` the lifecycle helpers actually need. */
export type ConnectionLifecycleInput = Pick<
  MapConnectionEdge,
  'scope' | 'isEol' | 'eolAt' | 'createdAt'
>;

/**
 * The wall-clock instant a connection expires, or `null` when no expiry
 * applies. Wormholes that are EOL expire `WORMHOLE_EOL_LIFETIME_MS` after
 * `eolAt`; non-EOL wormholes expire `WORMHOLE_DEFAULT_LIFETIME_MS` after
 * `createdAt`. Stargate / jumpbridge / abyssal connections never expire and
 * return `null`. An EOL flag without an `eolAt` stamp (defensive — a stale
 * client snapshot) also returns `null`.
 */
export function connectionExpiresAt(c: ConnectionLifecycleInput): Date | null {
  if (c.scope !== 'wh') return null;
  if (c.isEol) {
    if (!c.eolAt) return null;
    return new Date(new Date(c.eolAt).getTime() + WORMHOLE_EOL_LIFETIME_MS);
  }
  return new Date(new Date(c.createdAt).getTime() + WORMHOLE_DEFAULT_LIFETIME_MS);
}

/**
 * Milliseconds until `connectionExpiresAt(c)`. Returns `null` for
 * non-expiring connections, `0` for ones that have already passed expiry.
 *
 * **Parameters:**
 * - `c` — the connection lifecycle fields.
 * - `now` — clock to compare against (defaults to `Date.now()`; injectable for tests).
 */
export function connectionTimeLeftMs(
  c: ConnectionLifecycleInput,
  now: number = Date.now(),
): number | null {
  const expiresAt = connectionExpiresAt(c);
  if (!expiresAt) return null;
  return Math.max(0, expiresAt.getTime() - now);
}
