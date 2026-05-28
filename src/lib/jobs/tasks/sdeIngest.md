## sdeIngest task

**Purpose:** graphile-worker wrapper around `runIngest` so the Stage 16.6 setup wizard can trigger an on-demand SDE refresh without shelling into the container.
**File:** `src/lib/jobs/tasks/sdeIngest.ts`

---

### sdeIngest: JobModule
Registered task `'sde-ingest'`. No cron — enqueued only via the setup wizard's `setupRunSdeIngest()` Server Action (which calls `graphile_worker.add_job('sde-ingest', '{}'::json)`). The CLI path (`pnpm sde:bootstrap`) still bypasses graphile-worker and calls `runIngest()` directly.

**Returns** (as `ap_job_run.notes`): the `IngestResult` from `runIngest()` — `{ build, counts }`.

### Notes
- Long-running (downloads the SDE zip, bulk-inserts ~tens of thousands of rows). Don't block a request thread on this; the wizard enqueues and returns immediately.
- Idempotent — `runIngest` upserts everything via `onConflictDoUpdate`; re-running against the same pinned `SDE_BUILD` is a no-op write-wise.
- Scheduled SDE-delta refresh (using CCP's `changes/<build>.jsonl` automation feed) lands in a later stage; this module is the operator-driven path.
