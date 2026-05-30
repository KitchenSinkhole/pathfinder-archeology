## route.ts — GET /api/system/[systemId]/killboard

**Purpose:** On-demand recent-kills feed for the system-killboard sidebar module.
**File:** `src/app/api/system/[systemId]/killboard/route.ts`

### GET /api/system/[systemId]/killboard?limit=
- **Query:** `limit` (int 1–50, default 20). `systemId` from the path (coerced int).
- **Access:** any logged-in character (`getSession`; 401 otherwise). zKillboard data is public and per-system, not map-scoped.
- **Returns:** `{ ok:true, kills: KillboardKill[] }`. On zkb failure: `{ ok:false, error }` with **429** (`ZkbRateLimitError`) or **502** (`ZkbHttpError`); other errors → 500.
- Delegates to `killboardForSystem` (`@/lib/map/killboard`).
