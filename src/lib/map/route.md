## route.ts

**Purpose:** Read-only gate-jump route computation — distances from map systems to the configured trade hubs via BFS over `universe_stargate_edge`.
**File:** `src/lib/map/route.ts`

---

### routesForSystems(systemIds: number[]): Promise<Record<number, HubRoute[]>>
For every given EVE solar-system id, returns gate-jump distance to each hub in `apertureConfig.ROUTE_HUBS` (display order). Runs one BFS per hub across the whole gate graph, so the page calls this once for all systems on a map rather than per system-click. Wormhole / gateless systems get `jumps: null` per hub. Result keyed by system id.

### jumpsToHubs(systemId: number): Promise<HubRoute[]>
Convenience wrapper around `routesForSystems([systemId])`.

### Types
- `HubRoute` — `{ systemId, name, jumps: number | null }`. Re-exported from `src/types/index.ts`.

### Notes
- Stargates are treated as undirected (both directions indexed) so single-direction SDE rows don't break routing.
- Loads the full gate edge table per call; acceptable for read-only page loads. Caching is a later concern.

### Depends on
- `@/db/client` (`db`), `@/db/schema` (`universeStargateEdge`), `aperture.config` (`ROUTE_HUBS`).
