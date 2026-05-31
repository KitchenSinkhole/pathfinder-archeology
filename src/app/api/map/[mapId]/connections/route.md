## route.ts — POST /api/map/[mapId]/connections

**Purpose:** Create a wormhole/stargate/jumpbridge connection between two map systems.
**File:** `src/app/api/map/[mapId]/connections/route.ts`

### POST
Creates a new `ap_map_connection` row and emits `connection.create`. Returns `{ ok, data, eventId }` where `data` is the full edge body. On an auto-tagging `0121` map (Stage 17.10), after a successful create it calls `assignTagOnConnect`; if the new edge roots an untagged child, it emits a separate `system.updated` event with the assigned tag (best-effort — a tagging failure never fails the connection).

**Body:** `{ sourceMapSystemId: string, targetMapSystemId: string, scope, massStatus?, jumpMassClass?, isEol?, preserveMass?, isRolling? }` — system ids are bigint strings; scope is required.

**Responses:** 200 ok, 400 mutation error / invalid ids, 401 unauthenticated, 404 map not found.
