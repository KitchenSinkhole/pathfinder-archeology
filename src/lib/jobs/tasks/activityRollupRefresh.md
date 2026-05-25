## activityRollupRefresh.ts

**Purpose:** Hourly cron that runs `REFRESH MATERIALIZED VIEW CONCURRENTLY ap_activity_rollup` to update the weekly per-(character, map, kind) counter MV over `ap_map_event`. Stage 11.4.
**File:** `src/lib/jobs/tasks/activityRollupRefresh.ts`

---

### activityRollupRefresh: JobModule
- `name`: `'activity-rollup-refresh'`
- `cron`: `'15 * * * *'` (`:15` past every hour — offset from the `:30` stats-refresh slot so the two don't pile up against ESI / PG at the same minute).
- `run`: `withInstrumentation('activity-rollup-refresh', refresh)`.

### refresh(): { durationMs }
Checks `pg_class.relispopulated` to detect the cold-start case (MV created `WITH NO DATA` and never yet refreshed). On the first run it falls back to a blocking `REFRESH MATERIALIZED VIEW` (no `CONCURRENTLY`); every subsequent run uses `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Records wall-clock duration into `ap_job_run.notes`.

### Notes
- **CONCURRENTLY** is load-bearing: it takes a row-level lock and lets concurrent admin reads of the rollup keep working. It requires the MV's unique index (`ap_activity_rollup_pk_idx`, defined in `0007_activity_rollup.sql`) to exist.
- **Cold-start guard**: Postgres rejects `CONCURRENTLY` when `relispopulated = false` (view was never refreshed). The `relispopulated` check in `refresh()` covers that case — the first invocation runs a blocking refresh; all subsequent ones use `CONCURRENTLY`.
- Replaces the legacy `deleteStatisticsData @weekly` job's *rollup* responsibility; the *retention* responsibility moves to `pg_partman` partition drops on `ap_map_event` (Stage 11.5).
