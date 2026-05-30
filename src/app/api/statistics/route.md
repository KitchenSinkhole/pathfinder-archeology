## statistics/route.ts

**Purpose:** `GET /api/statistics` — global activity statistics for the Stage 17.7 Statistics dialog.
**File:** `src/app/api/statistics/route.ts`

---

### GET(request)
Query (`querySchema`, Zod): `scope` ∈ `private|corp|alliance` (required), `period` ∈ `week|month|year` (default `week`), `anchor` = optional `yyyy-mm-dd`.

- 401 when no session.
- 400 on invalid query.
- 403 when the requested `scope` is not in `resolveStatsAccess(session)` (response still includes `availableScopes` so the client can correct its tabs).
- Otherwise delegates to `loadActivityStats` and returns `{ ok: true, availableScopes, rows, label, prevAnchor, nextAnchor, hasNext }`.

`runtime = 'nodejs'`. Read-only; no `eventId`. Mirrors the `/api/map/[mapId]/export` route shape.
