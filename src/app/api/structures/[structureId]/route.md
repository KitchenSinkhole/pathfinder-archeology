## route.ts (PATCH / DELETE /api/structures/[structureId])

**Purpose:** Edit or remove a manual structure-intel row.
**File:** `src/app/api/structures/[structureId]/route.ts`

---

### PATCH /api/structures/[structureId]
Auth: `requireStructureMutate(session)`. `structureId` parsed via `parseBigInt` (400 on bad id). Body (Zod, all optional): `name` 1–100, `structureTypeId` int>0, `ownerName` ≤100 nullable, `notes` ≤2000 nullable. Calls `updateStructure` (writes an `update` audit event) → `withTypeName`.
**Responses:** `200 { ok: true, data: StructureIntel }`; `404` unknown id; `400` invalid id/JSON/body/FK; `401` not signed in.

### DELETE /api/structures/[structureId]
Auth: `requireStructureMutate(session)`. Calls `deleteStructure` (hard delete + `delete` audit event with full snapshot).
**Responses:** `200 { ok: true, data: { id } }`; `404` unknown id; `400` invalid id; `401` not signed in.

**Not a map event:** structures are deployment-global; no `ap_map_event` / realtime update.
