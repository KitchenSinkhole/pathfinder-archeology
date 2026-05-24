# Stage 12 — Server-side character location tracking (hot path)

**Goal:** A graphile-worker job per *tracked* character that polls ESI for the character's location regardless of any open tab, classifies each change as a gate jump vs a wormhole jump, and folds wormhole jumps onto every map the character is tracked on as authoritative `system.added` / `connection.create` events.
**Spec/roadmap:** `docs/plans/rebuild-roadmap.md` Stage 12; SPEC §5.3 ("character location tracking is the hottest job and is moved fully server-side"); SPEC §5.1 (server-observed mutation pathway, row 2 of three). Closes the "tabs drive ESI" coupling the legacy app had.

## Context

Phase 3 cron infra is shipped (Stage 11). What's missing is the *hot-path* per-character job that the spec singles out as the most cost-sensitive piece of the rebuild. Legacy Pathfinder ran location polling client-side from `/api/Map/updateData`, so closing every tab stopped tracking and opening N tabs multiplied ESI calls by N. The rebuild replaces that with one server-side job per tracked character, regardless of client state.

The map-mutation pathway already exists end-to-end (Stage 9): `commitMapEvent` lands one `ap_map_event` per change and the `tg_map_event_notify` trigger fans out `pg_notify('map:'||map_id, …)` for the WS server (Stage 8) to forward. Stage 12 is the missing input side — server-observed mutations driven by ESI rather than a client API call.

**Decisions (confirmed with user via AskUserQuestion in the 12.0 session):**
- **Tracking subscription = join table** (`ap_map_character_tracking`, shipped in 12.0). A character can be tracked on multiple maps simultaneously; matches the legacy `mapIds[]` semantic.
- **Scheduling pattern = re-enqueue from handler.** The job calls `helpers.addJob('location-poll', { characterId }, { runAt: now + interval })` at the end of each tick. Adaptive cadence (online: 5s, offline: 60s) falls out naturally. No cron entry.
- **Authz (interim):** mirror Stage 9 — any logged-in character with access to a map can opt their own tracking on/off for it. Leave a clear interim note pointing to Stage 15. Do not build a rights model here.
- **Sessioning:** each sub-stage below is run in its own Claude Code session (fresh context). Open this file, read the sub-stage, enter its labelled mode (`Shift+Tab`), then execute.

## Key facts to reuse (don't re-derive)

- **`apMapCharacterTracking`** (`src/db/schema/ap/map_character_tracking.ts`, Stage 12.0) — composite PK `(map_id, character_id)` + index on `character_id` alone. Hot-path query for the handler is `WHERE character_id = $1`, joined with `ap_map` on `deleted_at IS NULL`.
- **`commitMapEvent`** (`src/lib/map/mutations/core.ts`, Stage 9.1) — accepts `characterId: bigint | null`. Stage 11.2 already stripped the `'server-only'` import so jobs can call it from plain Node/tsx. Use this directly; do NOT thread through the `addSystem`/`createConnection` wrappers (those carry `'server-only'` and are tied to user-flow authz validation we don't need here).
- **`esiCall`** (`src/lib/esi/client.ts`, Stage 4) — circuit-breakered, downtime-aware, accepts `characterId` for character-authed ops. Three ops needed:
  - `getCharacterOnline` — `{ online, last_login, last_logout, logins }`.
  - `getCharacterLocation` — `{ solar_system_id, station_id?, structure_id? }`.
  - `getCharacterShip` — `{ ship_type_id, ship_item_id, ship_name }`.
  - All three are already in `OP_KEYS` (`src/lib/esi/opkeys.ts`). Decoders for `getCharacterLocation` already exist (`src/lib/esi/decoders/location.ts`); `getCharacterOnline` / `getCharacterShip` decoders are not in the seeded set and will be added in 12.1.
- **`universeStargateEdge`** (`src/db/schema/universe/geography.ts`, Stage 1) — directed edge table, PK `(from_system_id, to_system_id)`, secondary index on `to_system_id`. Gate-adjacency lookup is one PK probe.
- **Adaptive cadence constants** (`aperture.config.ts`, Stage 0):
  - `LOCATION_POLL_ONLINE_MS = 5_000`
  - `LOCATION_POLL_OFFLINE_MS = 60_000`
- **`withInstrumentation`** (`src/lib/jobs/withInstrumentation.ts`, Stage 11.1) — wrap the handler so every tick lands in `ap_job_run`. The runtime + observability already exist.
- **`JobModule.cron` is optional** (`src/lib/jobs/registry.ts`, Stage 11.1) — registering a task without a cron entry is the supported "scheduled via `addJob` only" path.
- **Realtime envelope for cross-tab breadcrumb:** the WS protocol (`src/lib/realtime/protocol.ts`) already has `characterUpdate` (Stage 8 / Stage 3 task vocabulary). The current load is forward-declared `unknown`; the location-poll is the first concrete writer and may tighten the schema in 12.3.

## What is intentionally NOT in scope

- **Real authz on tracking enable/disable.** Stage 15 lands the rights model. For Stage 12, any character with access to a non-soft-deleted map can opt their own tracking on/off.
- **History of past locations.** Legacy `character_log` is dropped per CLAUDE.md "no parallel audit tables" — the map-side `ap_map_event` captures every detected jump's downstream effect. Last-known location is a single state row, not a history.
- **The structure / station enrichment of `getCharacterLocation` payload.** The poll captures `solar_system_id`; resolving structure ids to names lives with the Stage 17 structure intel module.
- **Pod/abyss detection.** The legacy `updateUserData` branched on pod/abyss state. Defer to Stage 13 (intel modules) or a later cut of the poll handler once we have the basic gate-vs-WH path working.

---

## Sub-stage 12.0 — Tracking subscription schema ✅ SHIPPED
**Mode:** Accept edits
**Status:** Done.
**Delivered:**
- `src/db/schema/ap/map_character_tracking.ts` + `.md`
- `src/db/migrations/0009_map_character_tracking.sql` + `.rollback.sql`
- `tests/db/map-character-tracking.test.ts` (DB-gated, RUN_DB_TESTS=1)

## Sub-stage 12.1 — `location-poll` task: ESI fetch + persist, no map writes yet
**Mode:** Accept edits
**Goal:** Build the recurring per-character poll skeleton end-to-end *without* the map-mutation path. The handler reads tracking rows for `{ characterId }`, fetches ESI online/location/ship, persists last-known state on `ap_character`, and re-enqueues itself adaptively. The act of *observing* a location change should be visible in DB + telemetry; *acting on* it lands in 12.2.

**Touches:**
- `src/db/schema/ap/character.ts` — append `lastSystemId`, `lastShipTypeId`, `lastOnline`, `lastLocationAt` columns (last-known state, no history). Update companion `.md`.
- `src/db/migrations/0010_character_location_state.sql` (drizzle-generated) + `.rollback.sql`.
- `src/lib/esi/decoders/online.ts` + `.md`, `src/lib/esi/decoders/ship.ts` + `.md` — Zod schemas for the two ESI endpoints not already decoded. Re-export from `src/lib/esi/decoders/index.ts`.
- `src/lib/jobs/tasks/locationPoll.ts` + `.md` — `name: 'location-poll'`, **no cron** (`JobModule.cron` omitted), payload `{ characterId: string }` (stringified bigint — JSON has no bigint). Handler:
  1. Resolve character; if `status !== 'active'` or no tracking rows → exit without re-enqueue.
  2. `esiCall('getCharacterOnline', { characterId })`. If breaker-open / downtime, re-enqueue at the offline interval and exit (do not consume more breaker budget).
  3. If `online === false` → update `last_online = false`, re-enqueue at `LOCATION_POLL_OFFLINE_MS`, exit.
  4. Else → `Promise.all([getCharacterLocation, getCharacterShip])`; persist `lastSystemId` / `lastShipTypeId` / `lastLocationAt`; re-enqueue at `LOCATION_POLL_ONLINE_MS`.
  5. Returns `{ online, previousSystemId, currentSystemId, reenqueuedInMs }` into `ap_job_run.notes`.
- `src/lib/jobs/tracking.ts` + `.md` — `startTrackingCharacter(mapId, characterId)` (inserts the tracking row + enqueues the first poll if no in-flight job exists for the character) and `stopTrackingCharacter(mapId, characterId)` (deletes the row; the poll exits on its next tick when it sees no tracking rows). Use graphile-worker's `jobKey: \`location-poll:${characterId}\`` with `jobKeyMode: 'preserve_run_at'` to de-duplicate concurrent enqueues per character.
- `src/lib/jobs/registry.ts` — append `locationPoll` (no cron).
- `tests/integration/jobs/location-poll.test.ts` — DB-gated:
  - Mock `esiCall` (same pattern as Stage 11.3's `system-stats-refresh.test.ts`).
  - Seed character + map + tracking row.
  - First tick offline → no location persisted, next-run scheduled at `LOCATION_POLL_OFFLINE_MS`.
  - First tick online + at Jita → `lastSystemId = 30000142`, next-run at `LOCATION_POLL_ONLINE_MS`.
  - Second tick after `delete from ap_map_character_tracking` → exits without re-enqueue.
  - Breaker-open propagates as `ap_job_run.success = false` + re-enqueue at offline interval.

**Done when:**
- Handler runs end-to-end against mocked ESI in an integration test.
- Re-enqueueing visible via the graphile-worker `jobs` table (assertable from within the test).
- `pnpm typecheck` / `lint` / `test` green.

## Sub-stage 12.2 — Gate-vs-wormhole classifier + commit through `commitMapEvent`
**Mode:** Accept edits
**Goal:** When the poll detects a system change between ticks, classify it. If the two systems are gate-adjacent (`universe_stargate_edge` row exists either direction), no map writes. Otherwise, treat as a wormhole jump: for each map the character is tracked on, upsert source + target `ap_map_system` rows (`visible = true`, preserving position if the row already exists with `visible = false`) and create one `ap_map_connection` with `scope = 'wh'`. All writes go through `commitMapEvent` so the realtime fan-out and dedupe semantics from Stage 9 apply.

**Touches:**
- `src/lib/map/locationToConnection.ts` + `.md` — pure classification helper: `classifyJump({ fromSystemId, toSystemId }) → 'gate' | 'wormhole'`. Single `universe_stargate_edge` lookup in either direction (no recursion, no path-finding).
- `src/lib/jobs/tasks/locationPoll.ts` — extend 12.1's handler:
  - After persisting current location, if `previousSystemId != currentSystemId` AND both are non-null, classify.
  - On `'wormhole'`: query `ap_map_character_tracking → ap_map (WHERE deleted_at IS NULL)` for the character's maps. For each, run three commits inside a single transaction-per-map (own commitMapEvent calls):
    1. upsert source map-system (skip emit if already `visible = true` to keep event volume sane)
    2. upsert target map-system
    3. create the wormhole connection (`scope = 'wh'`, `mass_status = 'fresh'`, `jump_mass_class = null`)
  - Each `commitMapEvent` carries `characterId: BigInt(characterId)` so the audit FK points at the tracked character.
- `src/lib/jobs/locationCommit.ts` + `.md` (new) — the per-map commit helpers. Kept separate from `locationPoll.ts` so 12.2's logic is unit-testable without invoking the poll loop.
- `tests/integration/jobs/location-poll-jumps.test.ts` — DB-gated:
  - Seed source + target universe systems, a stargate edge between them, a map, tracking row, and a starting last-known location.
  - Mock ESI to return the new location.
  - Drive one tick → assert no `ap_map_event` rows for that map.
  - Reset, mock a non-adjacent target → drive one tick → assert exactly three events (`system.added`, `system.added`, `connection.create`) AND the row state matches.
  - Character tracked on two maps → both maps receive the events; one map soft-deleted → it does not.

**Done when:**
- Gate jump produces no map writes (asserted via `ap_map_event` row count).
- Wormhole jump produces the three expected events on every active tracked map.
- Re-running the same wormhole jump (idempotency safety net) does not double-add connections — handled by detecting that the new connection's endpoints already share an existing un-collapsed `ap_map_connection`. *Confirm rule in the sub-stage:* either skip the second commit, or always emit and trust the operator to clean up.

## Sub-stage 12.3 — Lifecycle: token loss, character status, `characterUpdate` broadcast
**Mode:** Accept edits
**Goal:** Harden the loop so a long-running deployment doesn't accumulate dead or runaway jobs, and surface the character's location to other tabs via the existing `characterUpdate` envelope.

**Touches:**
- `src/lib/jobs/tasks/locationPoll.ts` — failure handling:
  - Refresh-token failure (caught from `esiCall`) → the character can't be polled; delete *that character's* tracking rows and exit without re-enqueue. Log via `notes: { stopped: 'token-loss' }`. Re-enabling tracking is a user action that re-inserts a row + calls `startTrackingCharacter` again.
  - Character `status !== 'active'` (kick/ban) → exit without re-enqueue (rows preserved; a future un-kick re-arms the loop via `startTrackingCharacter`).
  - Breaker-open / downtime → re-enqueue at offline interval and exit (already in 12.1, but firmed up with explicit `EsiBreakerOpenError` / `EsiDowntimeError` branches).
- `src/lib/jobs/tracking.ts` — `startTrackingCharacter` becomes the single seam that re-arms the loop: insert tracking row, enqueue `location-poll` with `jobKey: 'location-poll:<characterId>'` + `jobKeyMode: 'preserve_run_at'`. Idempotent.
- `src/lib/realtime/protocol.ts` — tighten `characterUpdateLoadSchema.data` to a concrete shape: `{ characterId, online, systemId, shipTypeId, locationAt }`. Update consumers (just the WS server forward path) — none today actually parse it, so this is a pure schema fill-in.
- `src/lib/jobs/tasks/locationPoll.ts` — after persisting state, write a `characterUpdate` envelope to the realtime bus. Because the WS server's `bus.ts` (Stage 8) is keyed on `map:<map_id>` channels, the broadcast piggybacks on the `commitMapEvent` calls in 12.2 (the `system.added` / `connection.create` events already trigger `pg_notify` on each tracked map's channel; the `characterUpdate` is a separate envelope sent on each of those channels with the location payload).
- `tests/integration/jobs/location-poll-lifecycle.test.ts` — DB-gated:
  - Character status flip to 'kicked' → next tick exits cleanly, no re-enqueue.
  - Mocked `esiCall` throwing the simulated refresh-token failure → tracking rows for that character are gone, no re-enqueue, `ap_job_run.notes` carries the stop reason.
  - Mocked `EsiBreakerOpenError` → re-enqueue at `LOCATION_POLL_OFFLINE_MS`, breaker budget not consumed.
  - `characterUpdate` envelope reaches the bus on location change (use the LISTEN smoke pattern from `realtime-transport.test.ts`).

**Done when:**
- Each lifecycle branch covered by a passing test against real PG.
- The WS-bus assertion confirms cross-tab visibility of location changes.
- A 24h soak (manual or scripted) shows zero leaked `location-poll` jobs in graphile-worker's queue table for characters whose tracking rows were removed.

---

## Critical files (across the stage)

- **New:** `src/db/schema/ap/map_character_tracking.ts` (12.0, shipped), `src/lib/jobs/tasks/locationPoll.ts` (12.1–12.3), `src/lib/jobs/tracking.ts` (12.1), `src/lib/jobs/locationCommit.ts` (12.2), `src/lib/map/locationToConnection.ts` (12.2), `src/lib/esi/decoders/online.ts` + `ship.ts` (12.1).
- **Modified:** `src/db/schema/ap/character.ts` (12.1 last-known-location columns), `src/lib/jobs/registry.ts` (12.1 register), `src/lib/realtime/protocol.ts` (12.3 tighten characterUpdate).
- **Reused unchanged:** `src/lib/map/mutations/core.ts` (`commitMapEvent`), `src/lib/esi/client.ts` (`esiCall`), `aperture.config.ts` (poll cadences), `src/lib/jobs/withInstrumentation.ts`, `src/lib/jobs/runner.ts`.

## Verification

Per-sub-stage gates above. Stage-level "Done when" from the roadmap:
> A character tracked with no browser tab open still emits map updates; gate jumps are not falsely flagged as wormholes.

End-to-end manual check after 12.3:
1. `docker compose up -d && pnpm db:migrate && pnpm worker:dev`.
2. Open the Stage 7 read-only map view in *one* tab; opt that character into tracking on the map.
3. Close the tab.
4. From an EVE client (or by hand-rolling ESI state in a test), move the character through:
   - One gate jump (Jita ↔ Perimeter) — `pnpm jobs:status` shows the poll ran; no new `ap_map_event` rows for that map.
   - One wormhole jump — re-open the tab; the new system + connection are present.
5. Hit Ctrl-C on `pnpm worker:dev`; confirm no orphaned `location-poll` jobs in `graphile_worker.jobs` after restart.
