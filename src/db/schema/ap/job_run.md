## job_run.ts

**Purpose:** The `ap_job_run` table — per-invocation telemetry for the graphile-worker tasks introduced in Stage 11.
**File:** `src/db/schema/ap/job_run.ts`

---

### apJobRun
Drizzle table `ap_job_run`. Written by `withInstrumentation` (`src/lib/jobs/withInstrumentation.ts`) around every task handler invocation: one row inserted at `started_at`, finalised at `ended_at` with `success`, `error_text`, and any `notes` the handler returned. The roadmap's "All cron jobs run on schedule for one full week with success metrics visible" gate is read off this table (see `src/lib/jobs/queries.ts`).

**Columns:**
- `id` (`bigserial`) — PK.
- `name` (`text`) — graphile-worker task identifier (e.g. `signature-reap`, `eol-expiry`).
- `startedAt` (`started_at`, `timestamptz`, default `now()`) — row insert time.
- `endedAt` (`ended_at`, `timestamptz`, nullable) — set when the handler returns/throws. Rows where this is `NULL` either represent an in-flight handler or a worker that died mid-run.
- `success` (`boolean`, nullable) — `true` on clean return, `false` on throw, `NULL` while in flight.
- `errorText` (`error_text`, `text`, nullable) — truncated `Error.message` if the handler threw.
- `notes` (`jsonb`, nullable) — handler-returned details (e.g. `{ deleted: 12 }`, or the Stage 11.6 stub's `{ deferred: 'stage-17' }` marker).

**Index:** `ap_job_run_name_started_at_idx` on `(name, started_at desc)` — supports the per-task "recent runs" lookup used by the operability view.

**Notes:**
- graphile-worker's own queue tables (`graphile_worker.jobs` etc.) are created and migrated by its `runMigrations` API on first boot. Those track queued/locked/failed *jobs*; `ap_job_run` is our historical record of *runs* (longer retention, no FK to the queue).
