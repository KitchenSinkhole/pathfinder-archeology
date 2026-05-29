## system-search/route.ts

**Purpose:** Read-only solar-system name search feeding the "add system manually" dialog.
**File:** `src/app/api/map/[mapId]/system-search/route.ts`

---

### GET /api/map/[mapId]/system-search?q=<query>
View-guarded (`requireMapView`). Delegates to `searchSystems(q)` and returns `{ ok: true, data: SystemSearchResult[] }`. A missing/short `q` yields `{ ok: true, data: [] }` (the lib returns `[]` under 2 chars). Existence is not leaked: a missing or non-viewable map returns 404 via the guard.

The matched system's `id` is then POSTed to `/api/map/[mapId]/systems` (`map_update`) to actually place it — search is intentionally view-only so read-only members can browse the universe.
