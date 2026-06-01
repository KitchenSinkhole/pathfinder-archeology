import { version } from './package.json';

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

  /** Per-request timeout for read-side third-party integrations (zKillboard, EVE-Scout, GitHub). */
  INTEGRATION_REQUEST_TIMEOUT_MS: 5_000,

  /** `User-Agent` sent on read-side third-party integration requests. zKillboard rejects a blank UA with 403. */
  INTEGRATION_USER_AGENT: `Aperture/${version}`,

  /**
   * Stage 17.8. zKillboard R2Z2 ephemeral feed base (the RedisQ replacement).
   * `GET <base>/sequence.json` → `{ sequence }`; `GET <base>/<seq>.json` →
   * one killmail (ESI body + `zkb` block) or 404 when not yet published.
   */
  ZKB_R2Z2_BASE: 'https://r2z2.zkillboard.com/ephemeral',

  /**
   * Stage 17.8. Delay between zKB feed poll ticks. R2Z2 mandates a ≥6s wait
   * between sequence sweeps; going faster risks an IP block. Hard floor, not a
   * runtime knob.
   */
  ZKB_FEED_POLL_MS: 6_000,

  /** Stage 17.8. How often the feed rebuilds its in-memory `solarSystemId → mapIds` index from active maps. */
  ZKB_FEED_INDEX_REFRESH_MS: 30_000,

  /**
   * Stage 17.8. Max sequence files the feed pulls in one tick. Bounds a burst
   * (and the per-tick request budget against the 20 req/s R2Z2 limit); a deeper
   * backlog is skipped — the feed is live-only and does not backfill.
   */
  ZKB_FEED_MAX_CATCHUP: 200,

  /** Repository slug used by the changelog integration. Normalised from the legacy fork mismatch. */
  GITHUB_CHANGELOG_REPO: 'KitchenSink/aperture',

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
   *
   * Stage 15 adds:
   *   - `esi-characters.read_corporation_roles.v1` — drives the Director → admin
   *     authz promotion in `syncCharacterAuthz`.
   *   - `esi-characters.read_titles.v1` — mirrors EVE corporation titles into
   *     `ap_role` (`source='corp_title'`) so per-map access can be granted by title.
   * Adding scopes invalidates existing access tokens; users re-consent on next login.
   * No backwards-compat shim per CLAUDE.md ("No backwards-compatibility hacks").
   */
  ESI_SCOPES: [
    'publicData',
    'esi-location.read_location.v1',
    'esi-location.read_ship_type.v1',
    'esi-location.read_online.v1',
    'esi-characters.read_corporation_roles.v1',
    'esi-characters.read_titles.v1',
    // Powers the corporation search in the structure-intel dialog. The ESI
    // `/characters/{id}/search/` endpoint gates ALL categories behind this one
    // scope despite its structure-specific name.
    'esi-search.search_structures.v1',
  ],

  /**
   * Stage 15. `character-cleanup` cron cadence. Drives both kick-expiry sweeps
   * (5-minute clearing latency on minimum 5-minute kicks is acceptable) and the
   * authz resync pass that throttles by `authz_synced_at`.
   */
  CHARACTER_CLEANUP_CRON: '*/5 * * * *',

  /**
   * Stage 15. A character's `authz_level` is resynced by `character-cleanup` if
   * `authz_synced_at` is older than this (or NULL). 6 hours keeps director
   * status reasonably fresh without bombarding ESI for every active character
   * every cron tick.
   */
  CHARACTER_AUTHZ_RESYNC_STALE_AFTER_MS: 6 * 60 * 60 * 1000,

  /**
   * Stage 15. Per-tick batch cap for `character-cleanup`'s authz resync pass.
   * Bounds ESI call volume per tick; the next tick picks up the rest.
   */
  CHARACTER_AUTHZ_RESYNC_BATCH_SIZE: 25,

  /**
   * Stage 15. The ESI corporation role string that promotes a character to
   * `authz_level='admin'`. ESI returns role names with capital first letter
   * (per CCP's swagger); the comparison is case-sensitive.
   */
  AUTHZ_ADMIN_ROLE: 'Director',

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
   * hint when the connection has not yet been flagged EOL, and by Stage 11's
   * expired-connection cleanup cron as the practical lifetime cap.
   */
  WORMHOLE_DEFAULT_LIFETIME_MS: 172_800_000,

  /**
   * Default TTL applied to a newly created signature (`expires_at = created_at +
   * this`). Legacy `EXPIRE_SIGNATURES = 259200s` (5d); matches SPEC §347.
   */
  SIGNATURE_DEFAULT_TTL_MS: 259_200_000,

  /**
   * graphile-worker concurrency: how many task handlers may run in parallel in
   * one worker process. The current task set is light (housekeeping deletes +
   * one ESI fetch); a single worker is enough. Stage 11.
   */
  JOB_WORKER_CONCURRENCY: 4,

  /**
   * graphile-worker job poll interval (ms). LISTEN/NOTIFY drives dispatch on
   * the fast path; this is the fallback poll cadence for scheduled retries.
   * Stage 11.
   */
  JOB_POLL_INTERVAL_MS: 2_000,

  /**
   * `ap_job_run.error_text` cap. Caller's `Error.message` is truncated to keep
   * pathological stack traces from blowing up the row. Stage 11.
   */
  JOB_INSTRUMENTATION_ERROR_MAX_LENGTH: 2_000,

  /**
   * `ap_job_run.notes` cap, applied to `JSON.stringify(notes).length`. A handler
   * that returns a 1 MB blob shouldn't ship to history; large details belong in
   * `ap_map_event` or job logs. Stage 11.
   */
  JOB_INSTRUMENTATION_NOTES_MAX_BYTES: 8_000,

  /**
   * Maps soft-deleted (`ap_map.deleted_at IS NOT NULL`) more than this many
   * days ago are hard-purged at EVE downtime. Legacy `DAYS_UNTIL_MAP_DELETION`
   * (30). Stage 11.
   */
  MAP_PURGE_GRACE_DAYS: 30,

  /**
   * Batch cap for housekeeping jobs that delete row-by-row through
   * `commitMapEvent`. Bounds the per-run worst case: a thundering pg_notify
   * herd at downtime is still bounded, and a partial batch means the next
   * run picks up the rest. Stage 11.
   */
  JOB_DELETE_BATCH_SIZE: 500,
} as const;

export type ApertureConfig = typeof apertureConfig;
