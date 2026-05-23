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

  /** Path the WebSocket upgrade handler listens on (same Next.js deployment). SPEC §5.2 / §5.5. */
  WS_PATH: '/ws/map/update',

  /** Server→client ping cadence; sockets that miss the next pong are terminated. */
  WS_HEARTBEAT_MS: 30_000,

  /** First client reconnect delay after a dropped socket; backs off exponentially. */
  WS_RECONNECT_BASE_MS: 1_000,

  /** Ceiling for the client reconnect backoff. */
  WS_RECONNECT_MAX_MS: 30_000,

  /** No realtime traffic (incl. heartbeat) for this long flips the degraded-mode banner. SPEC §71 NFR. */
  WS_HEALTH_STALE_MS: 45_000,

  /**
   * Major trade hubs the read-only route module reports gate-jump distance to.
   * EVE solar-system IDs. Ordered for display. SPEC feature-matrix §3 (route module).
   */
  ROUTE_HUBS: [
    { systemId: 30000142, name: 'Jita' },
    { systemId: 30002187, name: 'Amarr' },
    { systemId: 30002659, name: 'Dodixie' },
    { systemId: 30002510, name: 'Rens' },
    { systemId: 30002053, name: 'Hek' },
  ],

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

  /**
   * Accepted `iss` claim values on EVE SSO JWT access tokens. CCP issues the
   * scheme-prefixed form (`https://login.eveonline.com`) on live tokens, but has
   * historically also used the bare host — accept both so verification is robust
   * to the inconsistency. SPEC §7 (`CCP_SSO_JWK_CLAIM`).
   */
  SSO_EXPECTED_ISSUER: ['login.eveonline.com', 'https://login.eveonline.com'],

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

  /**
   * How long a wormhole connection has left from the moment it goes EOL to the
   * point a reap job would purge it. Legacy `EXPIRE_CONNECTIONS_EOL = 15300s`
   * (4h 15m). Read by Stage 11's EOL-expiry job and surfaced as a countdown on
   * EOL-flagged edges. SPEC §6.5.
   */
  WORMHOLE_EOL_LIFETIME_MS: 15_300_000,

  /**
   * Default lifetime of a (non-EOL) wormhole connection from creation. Legacy
   * `EXPIRE_CONNECTIONS_WH = 172800s` (48h). Used for the canvas "expires in X"
   * hint when the connection has not yet been flagged EOL.
   */
  WORMHOLE_DEFAULT_LIFETIME_MS: 172_800_000,

  /**
   * Default TTL applied to a newly created signature (`expires_at = created_at +
   * this`). Legacy `EXPIRE_SIGNATURES = 259200s` (5d); matches SPEC §347.
   */
  SIGNATURE_DEFAULT_TTL_MS: 259_200_000,
} as const;

export type ApertureConfig = typeof apertureConfig;
