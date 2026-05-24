## worker-once.ts

**Purpose:** CLI entry point (`pnpm worker:once`) that runs every due cron job once and exits. Useful from CI smoke checks or as a fallback cron entry when the embedded worker isn't running.
**File:** `scripts/worker-once.ts`

Loads `.env` via `@next/env`, runs graphile-worker migrations on first invocation, then `runOnce` over the registered task list. Drains the pg pool and exits `0` on success / non-zero on failure. Does NOT install LISTEN or start a long-lived worker pool.
