## tracking.ts

**Purpose:** Lifecycle seam for the Stage 12 location-poll. `startTrackingCharacter` opts a character in (inserts the join row + enqueues the first poll); `stopTrackingCharacter` opts them out (deletes the row; the next handler tick exits cleanly).
**File:** `src/lib/jobs/tracking.ts`

---

### startTrackingCharacter({ mapId, characterId }): StartTrackingResult
1. Probe `ap_map` for the map's existence and `deleted_at IS NULL`. Returns `{ ok: false, error: 'map-missing' | 'map-soft-deleted' }` on either failure.
2. `INSERT … ON CONFLICT DO NOTHING` into `ap_map_character_tracking`. Result tells us whether the row already existed (`alreadyTracked: true`).
3. `SELECT graphile_worker.add_job('location-poll', …, job_key_mode => 'preserve_run_at')` — if a poll is already scheduled for this character (e.g. from a prior `start` on a different map), keep its existing run-at; if no job exists, this inserts a new one at `run_at = now()`.

Returns `{ ok: true, alreadyTracked }`.

### stopTrackingCharacter({ mapId, characterId }): { removed }
`DELETE` the tracking row. Does NOT cancel the in-flight poll job — the handler checks tracking-row count on entry and exits with `{ stopped: 'no-tracking' }` on the tick after the last row goes away. Avoiding an external cancel keeps the lifecycle race-free.

### stopAllTrackingForCharacter(characterId: bigint): Promise<void>
`DELETE` every tracking row for the character, across all maps. Used by `setCharacterTrackingAction` when a user disables a character from the Characters panel (Stage 17.5 follow-up). Same race-free stop semantics as `stopTrackingCharacter` — the next poll tick exits cleanly.

### seedTrackingForMap({ mapId, userId }): Promise<void>
The per-map default (per-map-character-tracking plan, Stage 1): the first time an account opens a map, auto-track all its **active** characters. In one transaction: `INSERT … ON CONFLICT DO NOTHING` the `ap_map_tracking_seed` marker; if it was freshly inserted, select the account's `status='active'` characters, upsert a `(mapId, characterId)` row per character, and enqueue each poll with `preserve_run_at`. If the marker already existed, returns without touching the join table — so a deliberately-empty per-map selection survives and is never re-seeded. The marker gate makes the auto-add fire exactly once per `(map, account)`. Caller guarantees the map is viewable/live (realtime-subscribe seam, downstream of `canViewMap`).

### trackCharactersOnMap(characterIds: bigint[], mapId: bigint): Promise<void>
Point each character's tracking at exactly `mapId` (the account's last-open map, Stage 17.5 follow-up). Per character, in one transaction: upsert the `(mapId, characterId)` row, delete its rows on **other** maps (one map at a time per character → switching maps moves tracking), and (re-)enqueue the poll with `preserve_run_at`. Called from the realtime `subscribe` handler with the account's **enabled** characters, downstream of `canViewMap` — the caller guarantees the map is viewable/live.

### Notes
- **`graphile_worker.add_job` via raw SQL.** No `WorkerUtils` instance held by this module; tracking enable/disable is rare enough that the per-call overhead is irrelevant. Keeps the module dependency-light so it can be imported from Server Actions, API routes, admin tools, etc.
- **`preserve_run_at` semantics in graphile-worker:** if a row with the given `job_key` exists, all attributes EXCEPT `run_at` are updated; if no row exists, this acts as a normal insert. Exactly the semantic we want for "start tracking shouldn't ever bump the clock of an already-running poll".
- **Authz interim** (Stage 9 mirror): no per-map rights check yet — any character with access to a non-soft-deleted map can opt themselves in. Stage 15 lands the real model.
