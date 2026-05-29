## route.ts (GET /api/structure-types)

**Purpose:** Serve the placeable Upwell structure types for the structure create/edit picker.
**File:** `src/app/api/structure-types/route.ts`

---

### GET /api/structure-types
Auth: any authenticated character (401 otherwise). Returns `upwellStructureTypes()` — static SDE reference data (`'Structure'`-category, published types). No params.

**Responses:** `200 { ok: true, data: UpwellStructureType[] }`; `401` not signed in.
