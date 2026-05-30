## route.ts — GET /api/system/[systemId]/graph

**Purpose:** On-demand bucketed activity series for the system-graph sidebar module.
**File:** `src/app/api/system/[systemId]/graph/route.ts`

### GET /api/system/[systemId]/graph?range=
- **Query:** `range` ∈ `24h | 7d | 30d` (default `7d`). `systemId` from the path (coerced int).
- **Access:** any logged-in character (`getSession`; 401 otherwise).
- **Returns:** `{ ok:true, series: SystemStatsPoint[] }`. K-space-only data; J-space systems return an empty series (the module also gates client-side via `isWormholeSystem`).
- Delegates to `systemStatsSeries` (`@/lib/map/stats`).
