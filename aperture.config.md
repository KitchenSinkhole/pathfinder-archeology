## aperture.config.ts

**Purpose:** Single source of truth for hard-coded app constants the spec says must NOT be runtime config (job cadences, JWK cap, downtime window, channel prefix, map ceilings).
**File:** `aperture.config.ts`

---

### apertureConfig
A frozen `as const` object exposed by named export. Later stages append fields here; nothing here is read from `process.env`.

Stage 0 seeds:
- `LOCATION_POLL_ONLINE_MS` — server-side location-poll cadence while a character is online (SPEC §5.3).
- `LOCATION_POLL_OFFLINE_MS` — cadence while offline.
- `JWK_REFETCH_MIN_INTERVAL_MS` — JWK-set refetch cap from SPEC §7 / footgun #3.
- `CCP_SSO_DOWNTIME_WINDOW_MIN` — minutes around 11:00 UTC tolerated as expected ESI outage.
- `MAP_EVENT_NOTIFY_CHANNEL_PREFIX` — `pg_notify` channel prefix for `ap_map_event` fanout (SPEC §5.2 / §6.5).
- `MAX_MAPS_PER_SCOPE` — legacy `pathfinder.ini` ceilings, refined in Phase 1.
- `MAX_SYSTEMS_PER_MAP` — applied where `ap_map_system.visible = true`.

Stage 2 (auth) adds:
- `SSO_AUTHORIZE_PATH` / `SSO_TOKEN_PATH` / `SSO_JWKS_PATH` — EVE SSO endpoint paths joined onto `env.AUTH_EVE_SSO_BASE` (TQ vs SISI host is env-configurable).
- `SSO_EXPECTED_ISSUER` — accepted `iss` claim values on the JWT access token (array: bare host + scheme-prefixed form).
- `SSO_TOKEN_REFRESH_BUFFER_S` — refresh the access token this many seconds before expiry (120s, matches legacy).
- `ESI_SCOPES` — default scope list requested at login; widened by later hot-path stages.

Stage 4 (ESI client) adds:
- `CCP_SSO_DOWNTIME` — CCP daily downtime start, UTC `HH:MM` (legacy `CCP_SSO_DOWNTIME`).
- `CCP_SSO_DOWNTIME_BUFFER_MIN` — extra minutes padded onto each side of the downtime window (legacy `DOWNTIME_BUFFER`).
- `ESI_BREAKER_FAILURE_THRESHOLD` — consecutive per-operationId failures that trip a breaker open.
- `ESI_BREAKER_COOLDOWN_MS` — open-breaker wait before a half-open trial request.
- `ESI_REQUEST_TIMEOUT_MS` — per-request ESI timeout (5s, matches legacy Guzzle).
- `ESI_DATASOURCE` — ESI `datasource` query param (`tranquility` vs `singularity`).

Stage 11 (graphile-worker runtime) adds:
- `JOB_WORKER_CONCURRENCY` — how many task handlers may run in parallel per worker process.
- `JOB_POLL_INTERVAL_MS` — fallback poll cadence for scheduled retries (LISTEN/NOTIFY drives the fast path).
- `JOB_INSTRUMENTATION_ERROR_MAX_LENGTH` — cap for `ap_job_run.error_text` (truncates `Error.message`).
- `JOB_INSTRUMENTATION_NOTES_MAX_BYTES` — cap for `ap_job_run.notes` (`JSON.stringify` length).
- `EOL_CONNECTION_EXPIRY_SECONDS` — 4h 15m, legacy `EXPIRE_CONNECTIONS_EOL`; threshold for the EOL-expiry cron.
- `WH_CONNECTION_EXPIRY_SECONDS` — 48h, legacy `EXPIRE_CONNECTIONS_WH`; threshold for the expired-wormhole cleanup cron.
- `MAP_PURGE_GRACE_DAYS` — 30, legacy `DAYS_UNTIL_MAP_DELETION`; grace window before hard-purging soft-deleted maps at downtime.
- `JOB_DELETE_BATCH_SIZE` — per-run cap for the row-by-row cleanup jobs (bounds the pg_notify burst at downtime; leftovers picked up on the next run).
- Per-task cron expressions live as `cron` strings on each task module in `src/lib/jobs/tasks/`, **not** here — they are graphile-worker concerns, not cross-cutting app knobs.

### ApertureConfig
Inferred type alias for `typeof apertureConfig` so consumers don't need to import the runtime value just to type a parameter.
