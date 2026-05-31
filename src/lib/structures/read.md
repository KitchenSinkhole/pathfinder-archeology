## read.ts

**Purpose:** Server-side reads for manual structure intel — per-system structure lists for the sidebar and the Upwell type catalog for the picker.
**File:** `src/lib/structures/read.ts`

---

### type StructureIntel
A structure row shaped for the sidebar: `id`/ids as strings, `typeName` resolved from `universe_type`, `createdByName` from `ap_character`, timestamps as ISO strings. `ownerCorporationId` (`number | null`) is the owner's EVE corp id; `ownerName` is that corp's name from the `universe_corporation` cache (both null when no owner is set). There is no free-text owner — the name has a single source of truth in the cache.

### type UpwellStructureType
`{ typeId, name, groupName }` — one placeable Upwell structure type for the create/edit picker.

---

### structuresForSystems(systemIds: number[]): Promise<Record<number, StructureIntel[]>>
Structure intel for the given universe systems, keyed by `system_id`. One batched query joins `universe_type` (type name), `universe_corporation` (resolved owner name), and `ap_character` (creator name). Empty input → `{}`; systems with no structures are absent.

**No realtime:** this is a load-time snapshot. Structures are deployment-global (not map-scoped) and have no realtime channel, so another user's additions appear only on the next page load.

### upwellStructureTypes(): Promise<UpwellStructureType[]>
Placeable Upwell structure types ordered by name, filtered by the `'Structure'` category **name** (robust across SDE re-ingest) and `published = true`.

### withTypeName(row: ApStructure): Promise<StructureIntel>
Shapes a freshly written `ap_structure` row into a complete `StructureIntel` (resolving `typeName`/`createdByName`, and the owner name from `universe_corporation` when a corp is set) so create/update routes return a spliceable row to the client.
