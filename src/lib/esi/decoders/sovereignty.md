## sovereignty.ts

**Purpose:** Zod decoders for sovereignty and faction-warfare ESI responses.
**File:** `src/lib/esi/decoders/sovereignty.ts`

---

### sovereigntyMapSchema
Validates `getSovereigntyMap` arrays with `system_id` plus optional faction/alliance/corporation owner ids.

**Returns:** `EsiSovereigntyMap`.

---

### factionWarSystemsSchema
Validates `getFactionWarSystems` arrays with system id, owner/occupier factions, contested text, and victory-point progress.

**Returns:** `EsiFactionWarSystems`.
