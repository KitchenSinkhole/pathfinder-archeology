## locationPoll.ts

**Purpose:** Per-character location-poll graphile-worker task. Scheduled via `addJob` only (no cron); the handler re-enqueues itself with an adaptive delay (5s online, 60s offline). Stage 12.1 + 12.2 + 12.3.
**File:** `src/lib/jobs/tasks/locationPoll.ts`

---

### locationPoll: JobModule
- `name`: `'location-poll'`
- `cron`: **omitted** — the loop is self-perpetuating after the first enqueue from `startTrackingCharacter`.
- `run`: `withInstrumentation('location-poll', poll)`.

### locationPollJobKey(characterId): string
Stable job key per character (`'location-poll:<id>'`). Used by both the handler's `addJob` (`jobKeyMode: 'replace'`) and `tracking.ts`'s `startTrackingCharacter` so at most one in-flight + one pending poll exists per character at any time.

### poll(payload, helpers): PollNotes
Algorithm:
1. **Tracking probe** — `EXISTS (SELECT 1 FROM ap_map_character_tracking WHERE character_id = $1)`. No rows → `{ stopped: 'no-tracking' }`, exit (no re-enqueue).
2. **Character probe** — load `status`, `last_system_id`, `last_ship_type_id`, `last_location_at`. Missing → `{ stopped: 'character-missing' }`. Not `active` → `{ stopped: 'character-inactive' }`.
3. **`getCharacterOnline`** — inside a `try/catch` covering the whole ESI phase (steps 3–6). See "Failure handling" below.
4. **Load active tracked map ids** — one query, used by both branches' broadcasts and the wormhole fold.
5. **Offline tick** — stamp `last_online = false`, re-enqueue at `LOCATION_POLL_OFFLINE_MS`, broadcast `characterUpdate(online: false, …)` on every tracked map channel using the *last-known* `lastSystemId` / `lastShipTypeId` / `lastLocationAt` from step 2. Return.
6. **Online tick** — `Promise.all([getCharacterLocation, getCharacterShip])`, persist `last_system_id` / `last_ship_type_id` / `last_online = true` / `last_location_at = now()`, re-enqueue at `LOCATION_POLL_ONLINE_MS`.
7. **Classify + fan-out** (Stage 12.2) — if the previous and current system ids differ and both are non-null, call `classifyJump`. On `'wormhole'`, call `foldWormholeJumpOntoMap` for each tracked map. Per-map outcomes land in `notes.folds[]`.
8. **Broadcast** — emit `characterUpdate(online: true, systemId, shipTypeId, locationAt)` on every tracked map channel. Goes out *after* the fold so the client receives `system.added` / `connection.create` first and the breadcrumb lands on a canvas that already knows the new system.

Returns `PollNotes` with whichever subset of `{ stopped, online, previousSystemId, currentSystemId, reenqueuedInMs, jumpClass, folds }` applied.

### Failure handling (Stage 12.3)
A single `try/catch` wraps steps 3–8:

- **`EsiTokenError`** — token-loss: `DELETE FROM ap_map_character_tracking WHERE character_id = $1`, return `{ stopped: 'token-loss' }`. The success row carries the stop reason; no re-enqueue. Re-enabling tracking later requires the user to re-authenticate and call `startTrackingCharacter` again.
- **`EsiBreakerOpenError` / `EsiDowntimeError`** — re-enqueue at `LOCATION_POLL_OFFLINE_MS` and re-throw so `withInstrumentation` records `success = false`. The loop survives.
- Other errors propagate untouched; graphile-worker handles retry per its own `max_attempts`.

### `characterUpdate` broadcast
The poll emits its breadcrumb via `pg_notify('map:<id>', envelope)` where the envelope is JSON of the form `{ task: 'characterUpdate', load: { characterId, online, systemId, shipTypeId, locationAt } }`. `bus.ts` (Stage 12.3-tightened) discriminates by the top-level `task` field — payloads without it stay on the `mapUpdate` path. The WS server forwards the resulting `ServerToClientMessage` unchanged.

### Notes
- **`payload.characterId` is a string** because the JSON payload of graphile-worker jobs has no `bigint`. The handler `BigInt()`s it back on entry.
- The character record's `updated_at` is bumped on every tick (`set({ updatedAt: sql\`now()\` })`) so a stuck tracking row is observable from outside the job system.
- **Re-enqueue happens BEFORE the fan-out and broadcast.** If a downstream step throws, the next poll tick is already scheduled — the failure shows up in `ap_job_run.success = false` for this tick but the loop keeps going. The fold's per-step idempotency rules (`src/lib/jobs/locationCommit.md`) make the retry safe.
- **`token-loss` returns success = true.** The stop reason lands in `notes.stopped`. An operator looking at `pnpm jobs:status` sees a clean stop, not a failing job — distinct from breaker-open which IS a failure (transient).
