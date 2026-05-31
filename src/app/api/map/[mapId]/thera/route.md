## thera/route.ts

**Purpose:** List the current EVE-Scout Thera/Turnur connections for the Thera sidebar module.
**File:** `src/app/api/map/[mapId]/thera/route.ts`

---

### GET /api/map/[mapId]/thera
Returns `{ ok: true, data: TheraConnection[] }`. Server-side proxy over `loadTheraConnections` (`src/lib/map/thera.ts`) — the browser doesn't reach EVE-Scout directly (CORS) and the result is fronted by the module's 60s TTL cache.

**Access:** `requireMapView` (view rights on the map; the EVE-Scout data itself is public).

**Errors:** EVE-Scout failures (`EveScoutError`) → 502; other failures → 500, both `{ ok: false, error }`.
