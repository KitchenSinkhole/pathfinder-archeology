## enums.ts

**Purpose:** Declares the `pgEnum`s that `ap_character` needs at table-create time. The rest of the map/connection enums land in Stage 6 and reuse these.
**File:** `src/db/schema/ap/enums.ts`

---

### characterStatus
`pgEnum('character_status', ['active', 'kicked', 'banned'])` — per-character moderation state. Replaces the legacy mutually-exclusive nullable `kicked`/`banned` timestamps with a single state machine. SPEC §6.5.

### authzLevel
`pgEnum('authz_level', ['member', 'manager', 'admin'])` — in-app authority level on `ap_character`. Replaces the legacy `role` lookup table; gates admin actions in Stage 15/16. SPEC §6.5.
