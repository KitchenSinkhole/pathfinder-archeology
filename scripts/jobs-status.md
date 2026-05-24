## jobs-status.ts

**Purpose:** CLI entry point (`pnpm jobs:status`) that prints a per-task table over the last 7 days of `ap_job_run`. Drives the Stage 11.6 "one-week soak" gate from the roadmap.
**File:** `scripts/jobs-status.ts`

Loads `.env` via `@next/env`, walks `jobModules()` (Stage 11 registry), calls `summary(name, 168h)` per task, and renders:

```
TASK                       CRON           LAST RUN  RUNS  OK  FAIL  ABNDND  AVG     FLAGS
signature-reap             */30 * * * *   2m ago    336  336    0       0  47ms
…
structure-resolve          0 */6 * * *    5h ago     28   28    0       0   2ms    STUB(stage-17)
```

Trailing diagnostic lines surface registry drift:
- **"Tasks with rows but not in registry"** — rows in `ap_job_run` whose name isn't in `jobModules()`. Usually a rename whose old row history was never pruned.
- **"Tasks registered but never run"** — registered task that's never produced an `ap_job_run` row. Either the cron hasn't fired yet or the worker isn't booted.

Flags column:
- `STUB(stage-17)` — `structure-resolve` is intentionally a no-op until Stage 17.
- `ABANDONED:N` — `N` runs have `ended_at IS NULL` (worker died mid-handler).
- `LAST:FAIL` — most recent run threw.

### Configuration
- `JOBS_STATUS_SINCE_HOURS` env var overrides the 168h (7d) window.

### Why a CLI instead of an admin page
Stage 11.6's plan defers the admin UI to Stage 16/17 (the admin route group doesn't exist yet); standing one up just for this would be scaffolding work that gets thrown away. A CLI reads `ap_job_run` directly and is enough for the one-week soak.
