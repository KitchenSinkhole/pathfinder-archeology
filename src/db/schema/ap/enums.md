## enums.ts

**Purpose:** Declares every `pgEnum` shared by the `ap_*` tables — the two `ap_character` enums plus the six map/connection enums added in Stage 6.
**File:** `src/db/schema/ap/enums.ts`

---

### characterStatus
`pgEnum('character_status', ['active', 'kicked', 'banned'])` — per-character moderation state. Replaces the legacy mutually-exclusive nullable `kicked`/`banned` timestamps with a single state machine. SPEC §6.5.

### authzLevel
`pgEnum('authz_level', ['member', 'manager', 'admin'])` — in-app authority level on `ap_character`. Replaces the legacy `role` lookup table; gates admin actions in Stage 15/16. SPEC §6.5.

### mapScope
`pgEnum('map_scope', ['wh', 'k_space', 'none', 'all'])` — which kinds of systems a map may hold. On `ap_map`.

### mapType
`pgEnum('map_type', ['private', 'corp', 'alliance'])` — map ownership/visibility class. On `ap_map`.

### systemStatus
`pgEnum('system_status', ['unknown', 'friendly', 'occupied', 'hostile', 'empty', 'unscanned'])` — per-system intel state driving node colour. On `ap_map_system`, default `unknown`.

### connectionScope
`pgEnum('connection_scope', ['wh', 'stargate', 'jumpbridge', 'abyssal'])` — what kind of link a connection is. On `ap_map_connection`.

### whMass
`pgEnum('wh_mass', ['fresh', 'reduced', 'critical'])` — wormhole remaining-mass band. Replaces the legacy JSON `massStatus` flag. On `ap_map_connection`, default `fresh`.

### whJumpMass
`pgEnum('wh_jump_mass', ['s', 'm', 'l', 'xl'])` — per-jump mass class (max ship size) of a wormhole. Nullable on `ap_map_connection` (non-WH links leave it null).
