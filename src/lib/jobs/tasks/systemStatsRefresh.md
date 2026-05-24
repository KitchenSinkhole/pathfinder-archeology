## systemStatsRefresh.ts

**Purpose:** Hourly cron that pulls per-system jumps + kills from ESI and upserts them into `ap_system_stats`, one row per (system, hour bucket). Stage 11.3.
**File:** `src/lib/jobs/tasks/systemStatsRefresh.ts`

---

### systemStatsRefresh: JobModule
- `name`: `'system-stats-refresh'`
- `cron`: `'30 * * * *'` (half-past every hour; matches legacy `@halfPastHour`, aligns with ESI's hourly publish boundary).
- `run`: `withInstrumentation('system-stats-refresh', refresh)`.

### refresh(): { fetchedJumps, fetchedKills, upserted, skippedNonKspace }
1. `Promise.all([esiCall('getUniverseJumps', …), esiCall('getUniverseKills', …)])` — both endpoints return whole-universe arrays for the closing hourly window; one call per endpoint, no per-system loops.
2. Merge the two arrays into a `Map<systemId, { jumps, shipKills, podKills, factionKills }>`. The `factionKills` field maps to ESI's `npc_kills` (legacy `system_kills_factions` naming preserved on the schema).
3. Filter to k-space (`universe_system.security IN ('H','L','0.0')`) — ESI already excludes WH systems, but the guard catches stray IDs (Abyssal `A`, Pochven `P`, wormhole `Cn`) defensively.
4. Single bulk `INSERT … ON CONFLICT (system_id, hour_bucket) DO UPDATE SET …` with `hour_bucket = date_trunc('hour', now())` (computed in Postgres to avoid Node↔PG clock skew). The upsert lets re-runs in the same hour overwrite cleanly.

Counts land in `ap_job_run.notes`.

### Notes
- **No retry logic in this task.** A `breaker-open` or `downtime` error from `esiCall` propagates; `withInstrumentation` records `success = false` and graphile-worker handles the retry per its own policy. The breaker (Stage 4) coordinates ESI back-pressure across the whole process.
- **No partition pre-create.** Stage 11.5 (`partition-maintenance`) keeps `ap_system_stats`'s daily partitions ahead of `now()`. If a partition is missing, the upsert errors out, the job records the failure, and the next maintenance run repairs it.
- The legacy circular-buffer (`system_jumps.value1..value24`) is gone; rolling-24h reads are now `WHERE hour_bucket > now() - interval '24 hours'`.
