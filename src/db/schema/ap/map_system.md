## map_system.ts

**Purpose:** The `ap_map_system` table — a system node placed on a map, referencing static `universe_system`.
**File:** `src/db/schema/ap/map_system.ts`

---

### apMapSystem
`pgTable('ap_map_system', …)`:
- `id` — `bigserial` PK.
- `map_id` — `bigint` FK → `ap_map.id` `ON DELETE CASCADE`.
- `system_id` — `integer` FK → `universe_system.id` `ON DELETE RESTRICT` (a static system in use must not be deletable).
- `visible` — `boolean`, required. **Lifecycle flag**: removing a system flips this `false` (row persists); re-adding upserts `true`. `MAX_SYSTEMS` counts only `visible = true`.
- `position_x` / `position_y` — `double precision`, default `0`. No legacy 2440×1480 clamping.
- `alias`, `tag`, `intel_notes` — `text`, nullable.
- `status` — `system_status` enum, default `unknown`.
- `locked` — `boolean`, default `false`.
- `rally_at` — `timestamptz`, nullable. Non-null ⇒ rally active.
- `first_added_at` / `last_visible_at` / `updated_at` — `timestamptz`, default `now()`.

**Unique:** `(map_id, system_id)` — one node per system per map (`ap_map_system_map_system_uq`).
