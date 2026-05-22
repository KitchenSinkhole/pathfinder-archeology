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

  /** CCP daily downtime start, UTC `HH:MM`. ESI calls are expected to fail in this window. SPEC §01. */
  CCP_SSO_DOWNTIME: '11:00',

  /** Minutes around CCP_SSO_DOWNTIME (11:00 UTC) treated as expected ESI outage. SPEC §4 NFR. */
  CCP_SSO_DOWNTIME_WINDOW_MIN: 8,

  /** Extra minutes padded onto each side of the downtime window. Legacy `DOWNTIME_BUFFER`. SPEC §01. */
  CCP_SSO_DOWNTIME_BUFFER_MIN: 1,

  /** Consecutive ESI failures (per operationId) that trip a circuit breaker open. SPEC §05. */
  ESI_BREAKER_FAILURE_THRESHOLD: 5,

  /** How long an open ESI breaker waits before allowing a half-open trial request. */
  ESI_BREAKER_COOLDOWN_MS: 60_000,

  /** Per-request ESI timeout. Legacy Guzzle used a 5s cap. SPEC §05 §1. */
  ESI_REQUEST_TIMEOUT_MS: 5_000,

  /** ESI `datasource` query param. `tranquility` (live) vs `singularity` (test server). */
  ESI_DATASOURCE: 'tranquility',

  /** `pg_notify` channel prefix for `ap_map_event` fanout. SPEC §5.2 / §6.5. */
  MAP_EVENT_NOTIFY_CHANNEL_PREFIX: 'map:',

  /** Per-scope ceilings for `ap_map.scope`. Defaults from legacy `pathfinder.ini`; refine in Phase 1. */
  MAX_MAPS_PER_SCOPE: { private: 3, corp: 1, alliance: 1 },

  /** Per-map system ceiling, enforced where `ap_map_system.visible = true`. SPEC §6.5. */
  MAX_SYSTEMS_PER_MAP: 400,

  /**
   * EVE SSO OAuth2 endpoint paths, joined onto `AUTH_EVE_SSO_BASE`. Paths are
   * stable app constants; the base host is env-configurable (TQ vs SISI). SPEC §7.
   */
  SSO_AUTHORIZE_PATH: '/v2/oauth/authorize',
  SSO_TOKEN_PATH: '/v2/oauth/token',
  SSO_JWKS_PATH: '/oauth/jwks',

  /** Expected `iss` claim on EVE SSO JWT access tokens. SPEC §7 (`CCP_SSO_JWK_CLAIM`). */
  SSO_EXPECTED_ISSUER: 'login.eveonline.com',

  /** Refresh the access token this many seconds before it expires. Legacy used a 120s buffer. */
  SSO_TOKEN_REFRESH_BUFFER_S: 120,

  /**
   * Default ESI scopes requested at login. Minimal location set for the
   * Phase-3 hot path plus public data; later stages widen as features need them. SPEC §7.
   */
  ESI_SCOPES: [
    'publicData',
    'esi-location.read_location.v1',
    'esi-location.read_ship_type.v1',
    'esi-location.read_online.v1',
  ],
} as const;

export type ApertureConfig = typeof apertureConfig;
