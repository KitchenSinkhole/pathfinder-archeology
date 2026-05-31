## locationCommit.ts

**Purpose:** Per-map fold for the Stage 12.2 location-poll. Turns "character moved from system A to system B (wormhole)" into the same set of events a user-driven `addSystem(A) + addSystem(B) + createConnection(A→B)` would produce, minus the redundant ones.
**File:** `src/lib/jobs/locationCommit.ts`

---

### foldWormholeJumpOntoMap({ mapId, characterId, fromSystemId, toSystemId }): FoldResult
Runs three steps in sequence, each its own `commitMapEvent` transaction:

1. **`ensureSystemVisible(from)`** — if a `(map_id, system_id)` row already exists with `visible = true`, skip (no event). Otherwise upsert visible=true and emit `system.added` carrying the full node body via `buildSystemNode`.
2. **`ensureSystemVisible(to)`** — same as #1.
3. **`ensureConnection(fromMapSystemId, toMapSystemId)`** — if a connection already links the two endpoints in *either* direction, skip. Otherwise insert a new `scope='wh'`, `mass_status='fresh'`, `jump_mass_class=null` connection and emit `connection.create` with the full edge body.
4. **`tagOnJump`** (Stage 17.10 auto-tagging) — calls `assignTagOnConnect`; on a `0121` map the destination is rooted as a child of the `from` system and the assigned tag is emitted as a separate `system.updated` event. No-op for ABC (tagged at add, in `ensureSystemVisible` via `assignTagOnAdd`) and unscheme'd maps. Best-effort: a tagging failure is logged and never fails the jump fold.

Returns `{ mapId, fromSystemAdded, toSystemAdded, connectionCreated }` — the booleans surface in `ap_job_run.notes` so the operability sweep can tell "the poll detected jumps and they were fully novel" from "the poll detected jumps but everything was already on the map".

### Idempotency rules (Stage 12.2 decision)
- **`system.added` suppressed** when the row is already visible. A re-add by a manual click in the UI between poll ticks is a separate event from the poll's perspective.
- **`connection.create` suppressed** when an A↔B link already exists in either direction. Mass/EOL/rolling state on the existing connection is left untouched — the poll observes movement, it doesn't reset operator state.

### Failure semantics
Each step is its own transaction. A failure between steps leaves a consistent state and the next poll tick (5s later on the online cadence) skips the parts that succeeded and retries the parts that didn't. There is no compensation logic.

### Notes
- Self-loop guard (`sourceMapSystemId === targetMapSystemId`) in `ensureConnection` is defensive — the schema's `ap_map_connection_no_self_loop` CHECK would throw, but failing clean keeps the logs obvious.
- Imports `commitMapEvent` from `src/lib/map/mutations/core.ts` (no `'server-only'` — see that file's `.md` for the precedent). Imports `buildSystemNode` from `src/lib/map/systemNode.ts` (extracted in 12.2 for the same reason).
- This module is the only place in Stage 12 that writes to `ap_map_*` tables; the poll handler itself is observation-only and delegates here for fan-out.
