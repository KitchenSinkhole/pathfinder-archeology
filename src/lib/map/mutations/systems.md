## systems.ts

**Purpose:** System-level map mutations (add / remove / update), each a single `commitMapEvent` call that lands one `ap_map_event` row and one realtime broadcast.
**File:** `src/lib/map/mutations/systems.ts`

---

### addSystem(input: AddSystemInput): Promise<ActionResult<MapEventPayload>>
Adds a solar system to a map. Inserts a new `visible = true` `ap_map_system` row, or — via the `(map_id, system_id)` unique index — flips a previously-removed row back to visible while leaving its alias/tag/status/intel intact (CLAUDE.md lifecycle rule: systems are never hard-deleted). Position is set only when provided (re-add keeps the prior position otherwise). Re-reads the placed row joined to its universe metadata + statics and emits `system.added` with the full node body.

**Parameters:**
- `input.mapId` — `ap_map.id`.
- `input.systemId` — EVE solar-system id (`universe_system.id`).
- `input.characterId` — audit FK; null when the actor was erased.
- `input.positionX` / `input.positionY` — optional canvas coordinates.

**Returns:** `ActionResult<MapEventPayload>` with a `system.added` payload.

---

### removeSystem(input: RemoveSystemInput): Promise<ActionResult<MapEventPayload>>
Flips `visible = false` (and stamps `last_visible_at`) on the `ap_map_system` row matching `(mapSystemId, mapId)`. The row persists. Throws (rolls back) if no matching row. Emits `system.removed` → `{ id }`.

**Parameters:**
- `input.mapSystemId` — `ap_map_system.id` (xyflow node id).
- `input.mapId`, `input.characterId` — as above.

---

### updateSystem(input: UpdateSystemInput): Promise<ActionResult<MapEventPayload>>
Updates intel/position fields. Only keys present in `input.patch` are written (presence detected via `in`, so `null`/`false` are honored). `rallyAt` is a `Date | null` on input and crosses the wire as an ISO string (or null). Throws (rolls back) if no matching row. Emits `system.updated` → `{ id, ...changed }`.

**Parameters:**
- `input.patch` — `UpdateSystemPatch`: `alias`, `tag`, `status`, `intelNotes`, `locked`, `rallyAt`, `positionX`, `positionY` (all optional).

---

### type AddSystemInput / RemoveSystemInput / UpdateSystemInput / UpdateSystemPatch
Input bags for the three helpers. Re-exported from `src/types/index.ts`.

### Depends On
- `commitMapEvent` (`./core`) — the single commit primitive.
- `apMapSystem`, `universeSystem`, `universeConstellation`, `universeRegion`, `universeSystemStatic`, `universeWormhole` (Drizzle schema) for the node-body re-read.
- `mapEventPayloadSchema` variants `system.added` / `system.removed` / `system.updated` (`@/lib/realtime/protocol`).
