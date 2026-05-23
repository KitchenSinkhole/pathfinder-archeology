## route.ts — POST /api/map/[mapId]/systems

**Purpose:** Add a solar system to a map.
**File:** `src/app/api/map/[mapId]/systems/route.ts`

### POST
Adds a solar system to the map. Inserts a new `ap_map_system` row, or reactivates a hidden one (same `(mapId, systemId)` unique pair). Returns `{ ok, data, eventId }` where `data` is the `system.added` payload.

**Body:** `{ systemId: number, positionX?: number, positionY?: number }`

**Responses:** 200 ok, 400 mutation error, 401 unauthenticated, 404 map not found.
