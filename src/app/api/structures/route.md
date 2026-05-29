## route.ts (POST /api/structures)

**Purpose:** Create a manual structure-intel row.
**File:** `src/app/api/structures/route.ts`

---

### POST /api/structures
Auth: `requireStructureMutate(session)` — any authenticated character (401 if not signed in). Body (Zod): `systemId` int>0, `name` 1–100, `structureTypeId` int>0, `ownerName` ≤100 nullable optional, `notes` ≤2000 nullable optional. Calls `createStructure({ ...body, characterId })` (which also writes a `create` audit event), then `withTypeName(row)`.

**Responses:** `200 { ok: true, data: StructureIntel }`; `400` invalid JSON / body / FK violation (unknown system or type); `401` not signed in.

**Not a map event:** structures are deployment-global (no `map_id`) so this emits no `ap_map_event` / realtime update.
