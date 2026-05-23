## route.ts — GET /api/map/[mapId]/wormhole-types

**Purpose:** Returns wormhole type options filtered to a solar system's class — fed by the WH-type dropdown in the signature inspector (SPEC §6.4).
**File:** `src/app/api/map/[mapId]/wormhole-types/route.ts`

### GET
**Query params:** `systemId` — the EVE solar-system id (`universe_system.id`) to filter by.

**Response:** `{ ok: true, data: WormholeTypeOption[] }` — each option carries `{ typeId, name, sourceClass, targetClass }`. Returns the universal `K162` (null source class) plus every type whose `source_class` matches the system's security label. An unrecognised `systemId` returns an empty array.

**Responses:** 200 ok, 400 missing/invalid systemId, 401 unauthenticated, 404 map not found.
