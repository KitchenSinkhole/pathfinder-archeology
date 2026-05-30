## space.ts

**Purpose:** Shared client-safe helper for classifying a map system as wormhole (J-) space, so K-space–only modules gate consistently.
**File:** `src/lib/map/space.ts`

---

### isWormholeSystem(system: MapSystemNode): boolean
True when the system has statics or its name matches `J######`. Used by `KillStatsModule` and `SystemGraphModule` to render an "n/a in wormhole space" state instead of fetching K-space stats. Type-only import of `MapSystemNode` (no runtime dependency on the server-only `loadMap`).
