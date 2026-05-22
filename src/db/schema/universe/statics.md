## statics.ts

**Purpose:** Drizzle tables for community-compounded wormhole data — per-system static spawns and the wormhole-type routing catalog.
**File:** `src/db/schema/universe/statics.ts`

---

### universeSystemStatic
`universe_system_static`. PK `(system_id, type_id)`, both CASCADE FKs. Maps each J-space system to the wormhole type(s) that always re-spawn there (anoik.is /systems). Seeded from vendored `scripts/data/system-static.csv` (WH statics are not in the official SDE).

### universeWormhole
`universe_wormhole`. PK `type_id` → `universe_type.id` CASCADE. Wormhole-type routing catalog (anoik.is /wormholes).

| Column | Type | Notes |
|---|---|---|
| type_id | int PK | FK → universe_type, CASCADE |
| name | text NOT NULL | WH code, e.g. `A239`, `K162` |
| source_class | text | class it can appear in (`C1`–`C6`, `C13`, `HS`, `LS`, `NS`, `Thera`, `Pochven`); same vocabulary as `universe_system.security`. `null` = any (K162) |
| target_class | text | class it leads into; `null` = unknown (K162) |

- Class-only catalog: mass/lifetime/scan-strength remain dogma-sourced (`universe_type_attribute` + `universe_type_override` via the effective view), so this table vendors only the navigationally-missing source/target class labels.
- `K162` is the universal reverse-exit: `source_class = null` (appears anywhere), `target_class = null` (resolved from the far side). Class-filter queries treat null source as "always offer".
- `source_class` is a single text column — anoik WH codes are overwhelmingly single-source. If a future code proves multi-source, promote to a `universe_wormhole_source(type_id, source_class)` junction; do not build it speculatively.
- Seeded from vendored `scripts/data/wormhole-classes.csv`.
