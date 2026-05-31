## thera/sync/route.ts

**Purpose:** Fold chosen EVE-Scout Thera/Turnur connections onto the map.
**File:** `src/app/api/map/[mapId]/thera/sync/route.ts`

---

### POST /api/map/[mapId]/thera/sync
Body: `{ connections: { hubSystemId, hubName, targetSystemId, signatureId? }[] }` (1–200). Calls `syncTheraConnections` (`src/lib/map/thera.ts`) and returns its `ActionResult<{ summary, payloads }>` (wrapper-level `eventId` is `0`; the `payloads` are the per-row committed events for the client to fold + dedupe).

**Access:** `requireMapMutate(… , 'map_update')` — same right as creating a connection by hand. Client-passed system ids are FK-checked against `universe_system`.
