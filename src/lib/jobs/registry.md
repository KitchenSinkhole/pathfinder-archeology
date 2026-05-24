## registry.ts

**Purpose:** Central registry of graphile-worker task modules; sub-stages 11.2–11.6 add their tasks by appending to the `modules` list. Builds the `TaskList` and `CronItem[]` consumed by `runner.ts`.
**File:** `src/lib/jobs/registry.ts`

---

### interface JobModule
What each task file under `src/lib/jobs/tasks/` exports.

- `name` — graphile-worker task identifier; globally unique.
- `cron` — optional 5-field cron expression. Omit for tasks scheduled by `addJob` rather than cron (e.g. Stage 12's per-character location poll).
- `run` — the graphile-worker `Task` handler. Should be wrapped in `withInstrumentation(name, raw)` so every invocation lands in `ap_job_run`.

### jobModules(): readonly JobModule[]
The full registered set. Exposed primarily for the operability page/CLI in 11.6.

### buildTaskList(extra?): TaskList
Builds the graphile-worker `TaskList` map (`{ [name]: run }`) from the registry. `extra` lets tests / scripts append in-process tasks (e.g. the smoke test in `tests/integration/jobs/`).

Throws on duplicate task names — a registry conflict is a coding error, not a runtime condition.

### buildCronItems(extra?): CronItem[]
Builds the graphile-worker `CronItem[]` for tasks whose `cron` is set. Used by `runner.ts` to construct `parsedCronItems`. The `identifier` is set to the task name so graphile-worker's de-duplication and backfill keying work as expected.

### Notes
- No `taskDirectory` — explicit imports keep the wiring greppable, work cleanly under `tsx` without filesystem discovery, and let TypeScript catch missing exports at build time.
- Per-task cron expressions live on each task module, **not** in `aperture.config.ts`. Cadences are a graphile-worker concern (one place to look when reading a task), not a cross-cutting app constant.
