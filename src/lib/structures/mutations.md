## mutations.ts

**Purpose:** Create/update/delete manual structure intel, each writing the `ap_structure` row plus an `ap_structure_event` audit row in one transaction.
**File:** `src/lib/structures/mutations.ts`

---

Structures have no `map_id`, so these do **not** use `commitMapEvent`/`ap_map_event` and emit no realtime event — they are a plain REST resource. Because any authenticated user may edit any structure, every mutation is stamped with the acting character in `ap_structure_event` for griefer accountability. All three helpers take `characterId: bigint | null`.

### createStructure(input: CreateStructureInput): Promise<ApStructure>
Inserts the structure + a `create` audit event (payload = the new row snapshot). Returns the new row. Throws on FK violation (bad `systemId`/`structureTypeId`) — the route maps that to 400.

### updateStructure(input: UpdateStructureInput): Promise<ApStructure | null>
Patches only the keys present in `patch`; always bumps `updated_at`. Writes an `update` audit event (payload = the patch). Returns the updated row, or `null` if the id does not exist (no event written → route returns 404).

### deleteStructure(input: DeleteStructureInput): Promise<ApStructure | null>
Hard-deletes the row + a `delete` audit event holding the full pre-delete snapshot (so the intel is recoverable). Returns the deleted row, or `null` if missing (→ 404).

### Input types
- `CreateStructureInput` — `{ systemId, name, structureTypeId, ownerCorporationId?, ownerName?, notes?, characterId }`
- `UpdateStructurePatch` — `{ name?, structureTypeId?, ownerCorporationId?, ownerName?, notes? }`
- `UpdateStructureInput` — `{ structureId, patch, characterId }`
- `DeleteStructureInput` — `{ structureId, characterId }`

`ownerCorporationId` arrives as `number | null` (the EVE corp id resolved from ESI search) and `ownerName` as that corp's name. The structure stores only the FK: a resolved corp upserts `{ id, name }` into `universe_corporation` (guaranteeing the FK target + caching the name) and stores `owner_corporation_id`; with no corp the id is null. There is no free-text owner column — the name lives solely in `universe_corporation`. The dialog always sends both keys, so an update treats either key's presence as "owner is being set".
