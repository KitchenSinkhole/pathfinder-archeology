## queries.ts

**Purpose:** Read-only helpers over `ap_job_run` for the Stage 11.6 operability sweep (CLI `pnpm jobs:status`, and any future admin page in Stage 16/17).
**File:** `src/lib/jobs/queries.ts`

---

### type JobRun
`apJobRun.$inferSelect` — re-exported so callers don't have to import the Drizzle schema separately.

### recentRuns(taskName, limit): Promise<JobRun[]>
Most recent `ap_job_run` rows for one task, newest first. Used for the per-task detail view.

### type JobSummary
- `name` — task identifier.
- `lastStartedAt` / `lastEndedAt` — wall-clock times of the most recent run.
- `lastSuccess` — boolean from the most recent finished run (`null` if the most recent row is in-flight).
- `lastErrorText` — truncated `Error.message` if the last run failed.
- `runCount` / `successCount` / `failCount` — count over the `sinceMs` window.
- `abandonedCount` — runs whose `ended_at IS NULL` and whose `started_at` is older than expected — i.e. the worker died mid-handler. Stage 11.6 CLI flags any non-zero count.
- `avgDurationMs` — mean of `(ended_at - started_at)` over finished runs in the window.

### summary(taskName, sinceMs): Promise<JobSummary>
Aggregates `ap_job_run` for a task across the last `sinceMs` of wall time. Used by the CLI's per-row summary.

### knownTaskNames(): Promise<string[]>
Distinct names from `ap_job_run`. The CLI cross-references this with `jobModules()` to flag tasks that are registered but have never run (`registered ∖ known`) and tasks that have rows but aren't registered (`known ∖ registered` — usually a rename that didn't migrate).
