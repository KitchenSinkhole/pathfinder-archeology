/**
 * Typed app-level constants. Knobs that the SPEC says must be hard-coded
 * (not runtime config) live here. Later stages append; nothing here is
 * read from the environment.
 *
 * See SPEC §5.3 (job cadences are hard-coded) and §7 (JWK cache cap).
 */
export const apertureConfig = {
  /** Server-side location-polling cadence while a character is online. SPEC §5.3. */
  LOCATION_POLL_ONLINE_MS: 5_000,

  /** Polling cadence while a character is offline. SPEC §5.3. */
  LOCATION_POLL_OFFLINE_MS: 60_000,

  /** Minimum interval between two JWK-set refetches. SPEC §7 / footgun #3. */
  JWK_REFETCH_MIN_INTERVAL_MS: 10_000,

  /** Minutes around CCP_SSO_DOWNTIME (11:00 UTC) treated as expected ESI outage. SPEC §4 NFR. */
  CCP_SSO_DOWNTIME_WINDOW_MIN: 8,

  /** `pg_notify` channel prefix for `pf_map_event` fanout. SPEC §5.2 / §6.5. */
  MAP_EVENT_NOTIFY_CHANNEL_PREFIX: 'map:',

  /** Per-scope ceilings for `pf_map.scope`. Defaults from legacy `pathfinder.ini`; refine in Phase 1. */
  MAX_MAPS_PER_SCOPE: { private: 3, corp: 1, alliance: 1 },

  /** Per-map system ceiling, enforced where `pf_map_system.visible = true`. SPEC §6.5. */
  MAX_SYSTEMS_PER_MAP: 400,
} as const;

export type ApertureConfig = typeof apertureConfig;
