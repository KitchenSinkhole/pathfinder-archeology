## (setup) actions.ts

**Purpose:** Server Actions for the `/setup` ops console. Gated by `readSetupCookie()` (a signed, short-TTL cookie minted by `setupUnlockAction` after a `SETUP_PASSWORD` check). Bypasses EVE SSO so an operator can recover from a broken auth deploy.
**File:** `src/app/(setup)/actions.ts`

---

### setupUnlockAction(password: string): Promise<ActionResult>
Constant-time compare against `env.SETUP_PASSWORD`. On match, sets the `ap_setup` cookie via `setSetupCookie()`. Refuses to run when `SETUP_PASSWORD` is empty (no accidental open-deploy). Error message is the generic `'Invalid password.'` to prevent enumeration. `console.warn`s `unlock-ok` / `unlock-failed` / `unlock-refused-no-env` with the request's `x-forwarded-for` so proxy + app logs can be correlated.

### setupLogoutAction(): Promise<ActionResult>
Best-effort delete of the `ap_setup` cookie.

### setupRunMigrations(): Promise<ActionResult<{ applied: number; tags: string[] }>>
Gated. Diffs `src/db/migrations/meta/_journal.json` against `drizzle.__drizzle_migrations` to compute pending entries, then invokes `migrate()` from `drizzle-orm/node-postgres/migrator`. Idempotent — re-running with no pending work returns `{ applied: 0, tags: [] }`. Returns the list of applied tags by their journal `tag` (e.g. `'0014_admin_event_kinds'`).

### setupRunSdeIngest(): Promise<ActionResult<{ jobId: string }>>
Gated. Enqueues the `sde-ingest` graphile-worker task via `graphile_worker.add_job`. Returns the queued job id as a base-10 string.

### setupRunCronOnDemand(name: string): Promise<ActionResult<{ jobId: string }>>
Gated. Validates `name` against `jobModules()` from `src/lib/jobs/registry.ts` so the wizard can't enqueue arbitrary strings, then enqueues via `graphile_worker.add_job(name, '{}')`. Returns the queued job id.

---

### Notes
- All actions emit a `console.warn` with the client IP (best-effort from `x-forwarded-for`) and the action name. No DB audit row — CLAUDE.md forbids parallel audit tables and `ap_map_event` is map-scoped.
- The unlock action's constant-time compare pads to the longer of the two buffers and checks the length separately so neither bypasses the other.
- `revalidatePath('/setup')` runs on unlock + logout so the page rerenders with the new locked/unlocked state.
- See [[setup-cookie]] for the cookie scaffold and [[env]] for the schema.
