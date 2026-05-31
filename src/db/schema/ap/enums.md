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

### apWebhookChannel
`pgEnum('ap_webhook_channel', ['discord'])` — outbound chat channel for an `ap_map_webhook` row. Stage 14 ships Discord only; adding `'slack'` later is a one-line `ALTER TYPE` migration plus a sibling client module.

### apWebhookEvent
`pgEnum('ap_webhook_event', ['history', 'rally'])` — which class of map events a webhook subscribes to. `history` mirrors every `ap_map_event` insert on the map; `rally` fires only when a `system.updated` event carries a non-null `rallyAt` (rally set, not cleared).

### mapRight
`pgEnum('map_right', ['map_create', 'map_update', 'map_delete', 'map_import', 'map_export', 'map_share'])` — Stage 15. The six rights a corp may grant via `ap_corporation_right`. `map_create` is a global capability; the others gate per-map mutations. Names match the legacy `right.name` strings (SPEC §6.5).

### roleSource
`pgEnum('role_source', ['builtin', 'corp_title', 'external'])` — Stage 15. Where an `ap_role` row originates. `corp_title` rows are mirrored from EVE corporation titles; `external_ref` is `'<corp_id>:<title_id>'`. `external` rows come from Discord/third-party syncs.

### structureEventKind
`pgEnum('structure_event_kind', ['create', 'update', 'delete'])` — Stage 17.2. The mutation recorded in `ap_structure_event`, the append-only accountability log for manual structure intel.

### tagScheme
`pgEnum('tag_scheme', ['none', 'abc', '0121'])` — Stage 17.10. The auto-tagging scheme a map runs (`ap_map.tag_scheme`, default `none`). `abc` = per-WH-class sequential letters; `0121` = positional chain numbering off the Home system. Adding a third scheme is additive (one `ALTER TYPE … ADD VALUE` + a strategy module + a `registry.ts` line).
