## runner.ts

**Purpose:** graphile-worker boot, shutdown, and one-shot helpers. Owns the long-lived `Runner` for the embedded worker process (SPEC §5.3).
**File:** `src/lib/jobs/runner.ts`

---

### startWorker(extraModules?): Promise<Runner>
Idempotent boot. Runs graphile-worker's own `runMigrations` to create/upgrade the `graphile_worker` schema, then calls `run({ pgPool, taskList, parsedCronItems, … })` and returns the `Runner`. Repeat calls in the same process return the existing instance.

`extraModules` appends to the registered set in `registry.ts` — primarily for tests / scripts that need a one-off task.

### stopWorker(): Promise<void>
Graceful shutdown via `runner.stop()`. No-op when no worker is running. Wired into `server.ts`' SIGTERM/SIGINT handlers.

### runWorkerOnce(extraModules?): Promise<void>
Run every due cron job once and exit. Used by `pnpm worker:once`. Runs migrations first so a fresh DB works.

### isWorkerRunning(): boolean
Whether `startWorker` has booted in this process. For tests/health.

### Notes
- **Shares the app's `pg.Pool`** (`@/db/client.pool`) — no separate connection pool for the worker. graphile-worker's LISTEN client is internal to the runner.
- **`noHandleSignals: true`** — `server.ts` owns process signals and shuts the worker down explicitly. Letting graphile-worker install its own SIGTERM handler would race with our HTTP server shutdown.
- The `graphile_worker` schema name is the library default — kept as-is; no operational reason to rename.
- `concurrency` and `pollInterval` come from `apertureConfig`. LISTEN/NOTIFY drives the fast dispatch path; the poll interval is only the fallback for scheduled retries.
