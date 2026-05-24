## activityRollupRefresh.ts

**Purpose:** Hourly cron that runs `REFRESH MATERIALIZED VIEW CONCURRENTLY ap_activity_rollup` to update the weekly per-(character, map, kind) counter MV over `ap_map_event`. Stage 11.4.
**File:** `src/lib/jobs/tasks/activityRollupRefresh.ts`

---

### activityRollupRefresh: JobModule
- `name`: `'activity-rollup-refresh'`
- `cron`: `'15 * * * *'` (`:15` past every hour — offset from the `:30` stats-refresh slot so the two don't pile up against ESI / PG at the same minute).
- `run`: `withInstrumentation('activity-rollup-refresh', refresh)`.

### refresh(): { durationMs }
Executes `REFRESH MATERIALIZED VIEW CONCURRENTLY "ap_activity_rollup"` against the shared `db` client and records the wall-clock duration into `ap_job_run.notes` so the operability page (Stage 11.6) can graph it.

### Notes
- **CONCURRENTLY** is load-bearing: it takes a row-level lock and lets concurrent admin reads of the rollup keep working. It requires the MV's unique index (`ap_activity_rollup_pk_idx`, defined in `0007_activity_rollup.sql`) to exist — without that PG falls back to `ERROR: cannot refresh materialized view ... concurrently`.
- The MV was created `WITH NO DATA`, so the very first run populates it from scratch and can be slower than subsequent incremental-shaped runs (`CONCURRENTLY` still recomputes the full result, but PG can skip writes for unchanged rows). The first-run duration shows up in `ap_job_run.notes.durationMs`.
- Replaces the legacy `deleteStatisticsData @weekly` job's *rollup* responsibility; the *retention* responsibility moves to `pg_partman` partition drops on `ap_map_event` (Stage 11.5).
