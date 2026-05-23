## loadMap.ts

**Purpose:** Server-only data-loading layer for the read-only map view — the single place the map page reads `ap_map*` + `universe_*` data.
**File:** `src/lib/map/loadMap.ts`

---

### loadMapForView(mapId: bigint): Promise<MapViewData | null>
Loads one map for rendering. Returns `null` if the map is missing or soft-deleted (`deleted_at` set). Joins visible `ap_map_system` rows to `universe_system` / constellation / region, attaches wormhole static codes, loads all `ap_map_connection` rows, and loads `ap_map_signature` rows for every visible system. All `bigint` ids and `timestamptz`s are stringified (ISO for dates) so the result is serialisable across the Server→Client boundary.

**Interim access:** no per-map permission model exists yet (Stage 15). Any logged-in character may view any non-soft-deleted map.

---

### listViewableMaps(): Promise<MapListItem[]>
All maps where `deleted_at IS NULL`, ordered by name. Feeds the `/maps` list.

---

### Types
- `MapSystemNode` — a visible system flattened with its universe metadata + statics.
- `MapConnectionEdge` — a connection with scope/mass/EOL/flag fields; endpoints are `ap_map_system.id` strings. `eolAt` (ISO or null) and `createdAt` (ISO) flow through so the canvas can compute the EOL countdown.
- `MapSignature` — a scan signature inside a placed system. `expiresAt` is an ISO string.
- `MapViewData` — `{ map, systems, connections, signatures }`, the page's full payload.
- `MapListItem` — a map row for the list.

These are re-exported from `src/types/index.ts`.

### Depends on
- `@/db/client` (`db`), `@/db/schema` (tables + enums).
