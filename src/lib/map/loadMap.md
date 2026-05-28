## loadMap.ts

**Purpose:** Server-only data-loading layer for the read-only map view — the single place the map page reads `ap_map*` + `universe_*` data.
**File:** `src/lib/map/loadMap.ts`

---

### loadMapForView(mapId: bigint, viewerCharacterId: bigint): Promise<MapViewData | null>
Loads one map for rendering. Returns `null` if the map is missing, soft-deleted, or the viewer is not allowed to see it (Stage 15 `canViewMap`). The viewer-id is required — passing the wrong one is an access-control bug the type system catches. Joins visible `ap_map_system` rows to `universe_system` / constellation / region, attaches wormhole static codes, loads all `ap_map_connection` rows, and loads `ap_map_signature` rows for every visible system (LEFT JOIN to `universe_wormhole` to surface the WH code as `wormholeCode`). Also calls `loadMapPresence(mapId)` so the returned `MapViewData` carries the initial roster of online tracked pilots. All `bigint` ids and `timestamptz`s are stringified (ISO for dates) so the result is serialisable across the Server→Client boundary.

---

### loadMapPresence(mapId: bigint): Promise<MapPresenceEntry[]>
Online tracked pilots currently in a known system on this map. Joins `ap_map_character_tracking` × `ap_character`, left-joins `universe_type` for the ship name. Filters to `last_online = true AND last_system_id IS NOT NULL` — offline pilots are hidden from the badge per UX choice. Ordered by character name for stable hover-list rendering. The companion to the realtime `characterUpdate` envelope: same per-pilot shape (minus the always-true `online` flag), so the client merges live updates on top without converting between forms.

---

### listViewableMaps(viewerCharacterId: bigint): Promise<MapListItem[]>
Maps the viewer can see, ordered by name. Feeds the `/maps` list. Stage 15 filters server-side via `viewableMapPredicate` — admins see every non-soft-deleted map; members see maps where they are the owner (by scope) or where one of their roles appears in `ap_map_role_access`.

---

### listAdminMaps(scope: AdminVisibilityScope): Promise<AdminMapListItem[]>
Stage 16.2. Maps an admin / manager can act on, **including soft-deleted rows** (which `listViewableMaps` filters out). Distinct from the user-facing listing because the admin row shape carries the full owner FKs + `deleted_at` so the admin UI can render ownership and offer restore / purge-now actions. Scoping is delegated to `mapScopeFilterFor` — global for admin, corp-scoped (owner_corporation / owner_alliance / owner_character∈corp-members) for manager. Soft-deleted rows are ordered first, then by name. Feeds `/admin/maps`.

---

### Types
- `MapSystemNode` — a visible system flattened with its universe metadata + statics. `statics` prefers `universe_wormhole.target_class` labels (e.g. `["C3","C5"]`) and falls back to the wormhole catalog name when the target class is null.
- `MapConnectionEdge` — a connection with scope/mass/EOL/flag fields; endpoints are `ap_map_system.id` strings. `eolAt` (ISO or null) and `createdAt` (ISO) flow through so the canvas can compute the EOL countdown.
- `MapSignature` — a scan signature inside a placed system. `groupKey` is one of the seven scanner-level keys (or null). `typeId` is non-null only when `groupKey === 'wormhole'` and points at a `universe_type` row also present in `universe_wormhole`; `wormholeCode` is the LEFT JOIN of `universe_wormhole.name` for display ("B274", "K162", …). `name` carries the user-typed site name for cosmic sigs, or a mirror of the wormhole code for wormhole sigs. `expiresAt` is an ISO string.
- `MapPresenceEntry` — one online tracked pilot: `{ characterId, characterName, systemId, shipTypeId, shipTypeName, locationAt }`. `systemId` is the EVE solar-system id; `locationAt` is ISO.
- `MapViewData` — `{ map, systems, connections, signatures, presence }`, the page's full payload.
- `MapListItem` — a map row for the user-facing list.
- `AdminMapListItem` — a map row for `/admin/maps`: includes owner FKs (`ownerCharacterId`/`ownerCorporationId`/`ownerAllianceId` as nullable strings), `createdAt`/`updatedAt`/`deletedAt` ISO strings, and the same identity fields as `MapListItem`.

These are re-exported from `src/types/index.ts`.

### Depends on
- `@/db/client` (`db`), `@/db/schema` (tables + enums), `@/lib/auth/rights` (`canViewMap`, `viewableMapPredicate`, `mapScopeFilterFor`, `AdminVisibilityScope`).
