## worker-dev.ts

**Purpose:** CLI entry point (`pnpm worker:dev`) that boots a standalone graphile-worker process — useful when iterating on a single task without restarting the full Next.js server.
**File:** `scripts/worker-dev.ts`

Loads `.env` via `@next/env` (same as `server.ts`), then calls `startWorker()` and awaits the runner's promise. SIGTERM/SIGINT trigger `stopWorker()` + pool drain + clean exit. graphile-worker's own signal handling is disabled in `runner.ts`, so this script's handlers are the only ones in play.

In production the worker runs in-process with the HTTP server (boot path in `server.ts`); this script is for local development only.
