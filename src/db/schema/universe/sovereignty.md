## sovereignty.ts

**Purpose:** Drizzle models for ESI-refreshed sovereignty and faction warfare universe state.
**File:** `src/db/schema/universe/sovereignty.ts`

---

### universeSovereigntyMap
One row per sovereign system, keyed by `system_id`, with nullable faction / alliance / corporation owner ids from ESI.

---

### universeFactionWarSystem
One row per faction-warfare system, keyed by `system_id`, with owner/occupier faction ids, contested state, and victory-point progress.
