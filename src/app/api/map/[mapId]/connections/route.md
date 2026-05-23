## route.ts — POST /api/map/[mapId]/connections

**Purpose:** Create a wormhole/stargate/jumpbridge connection between two map systems.
**File:** `src/app/api/map/[mapId]/connections/route.ts`

### POST
Creates a new `ap_map_connection` row and emits `connection.create`. Returns `{ ok, data, eventId }` where `data` is the full edge body.

**Body:** `{ sourceMapSystemId: string, targetMapSystemId: string, scope, massStatus?, jumpMassClass?, isEol?, isFrigate?, preserveMass?, isRolling? }` — system ids are bigint strings; scope is required.

**Responses:** 200 ok, 400 mutation error / invalid ids, 401 unauthenticated, 404 map not found.
