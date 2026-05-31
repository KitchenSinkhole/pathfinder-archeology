## page.tsx (map view)

**Purpose:** Read-only map view route (`/map/<id>`) — server-loads a map and renders it on the xyflow canvas with route, intel, and kill-stats sidebars.
**File:** `src/app/(app)/map/[[...slug]]/page.tsx`

### Renders
The map name/meta header above `<MapCanvas>`. Empty-state `Card` (with a back-to-maps link) when no map id is in the slug or the map is missing/deleted.

### Behaviour & Interactions
- Optional catch-all slug; the first segment is the map id (numeric → bigint, else empty state).
- `loadMapForView(mapId, viewerCharacterId)` returns null for missing / soft-deleted / non-viewable maps → "Map not found" (Stage 15 — does not leak existence).
- Precomputes hub routes (`routesForSystems`), 24h stats (`statsForSystems`), read-side intel (`intelForSystems`), manual structure intel (`structuresForSystems`), the map's editable settings (`loadMapSettings`, for the Stage 17.6 settings dialog), the viewer's connection-travel-animation toggle (`getConnectionTravelAnimation`), `isMapOwnerOrAdmin` (Stage 17.10 — gates the Map Settings "Tagging" tab), and the account roster (`getAccountCharacters`) for all visible systems in parallel and passes them to the client canvas. Initial pilot-presence (`MapViewData.presence`) ships with the map payload from `loadMapForView`.
- `viewerCharacterIds` is derived from the account roster (active characters' ids as numbers) and passed to `MapCanvas` for the CTRL+V fast-paste location check (matches the paste target against where any of the viewer's pilots are).
- Session gating is handled by the `(app)` layout. No edit affordances.

### Depends On
- `@/lib/map/loadMap`, `@/lib/map/route`, `@/lib/map/stats`, `@/lib/map/intel`, `@/lib/structures/read`, `@/lib/session` (`getAccountCharacters`, `getConnectionTravelAnimation`, `requireSession`), `@/components/map/MapCanvas`, `@/components/ui/card`.
