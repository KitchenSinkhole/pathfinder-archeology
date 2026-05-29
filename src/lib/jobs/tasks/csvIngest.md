## csvIngest task

**Purpose:** graphile-worker wrapper around `runCsvIngest` so the setup wizard can trigger an on-demand refresh of the vendored wormhole CSVs without re-running the full SDE ingest.
**File:** `src/lib/jobs/tasks/csvIngest.ts`

---

### csvIngest: JobModule
Registered task `'csv-ingest'`. No cron — enqueued only via the setup wizard's `setupRunCsvIngest()` Server Action (which calls `graphile_worker.add_job('csv-ingest', '{}'::json)`). The CLI path (`pnpm sde:csv`) still bypasses graphile-worker and calls `runCsvIngest()` directly.

**Returns** (as `ap_job_run.notes`): the `IngestResult` from `runCsvIngest()` — `{ build, counts }`.

### Notes
- Re-ingests only the three vendored CSVs (`system-static.csv`, `wormhole-overrides.csv`, `wormhole-classes.csv`); does not touch the SDE zip.
- Requires `universe_system` / `universe_type` to be populated first — `runCsvIngest` resolves system/type ids against those tables. Run `sde-ingest` first on a fresh database.
- Idempotent — upserts via `onConflictDoUpdate`.
