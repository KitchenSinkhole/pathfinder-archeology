## route.ts — PATCH/DELETE /api/map/[mapId]/systems/[systemId]

**Purpose:** Update or remove a placed system from a map. `[systemId]` is `ap_map_system.id` (the xyflow node id).
**File:** `src/app/api/map/[mapId]/systems/[systemId]/route.ts`

### PATCH
Updates only the fields present in the body. Returns `{ ok, data, eventId }` where `data` is the `system.updated` payload.

**Body:** `{ alias?, tag?, status?, intelNotes?, locked?, rallyAt?, positionX?, positionY? }` — all optional; only present keys are written. `rallyAt` is an ISO datetime string or null.

### DELETE
Flips `visible = false` on the `ap_map_system` row (row persists — the lifecycle rule). Returns `{ ok, data, eventId }` where `data` is the `system.removed` payload.

**Responses:** 200 ok, 400 mutation error / invalid id, 401 unauthenticated, 404 map not found.
