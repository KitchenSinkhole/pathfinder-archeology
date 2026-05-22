## map_connection.ts

**Purpose:** The `ap_map_connection` table — a link (wormhole, gate, jumpbridge, abyssal) between two map systems.
**File:** `src/db/schema/ap/map_connection.ts`

---

### apMapConnection
`pgTable('ap_map_connection', …)`:
- `id` — `bigserial` PK.
- `map_id` — `bigint` FK → `ap_map.id` `ON DELETE CASCADE`.
- `source_map_system_id` / `target_map_system_id` — `bigint` FK → `ap_map_system.id` `ON DELETE CASCADE` (link dies if either endpoint system is removed).
- `scope` — `connection_scope` enum, required.
- `mass_status` — `wh_mass` enum, default `fresh`.
- `jump_mass_class` — `wh_jump_mass` enum, nullable (only WH links set it).
- `is_eol`, `is_frigate`, `preserve_mass`, `is_rolling` — `boolean`, default `false`.
- `eol_at` — `timestamptz`, nullable. Stamped when `is_eol` first goes true; read by the EOL-expiry cron.
- `created_at` / `updated_at` — `timestamptz`, default `now()`.

**Check:** `source_map_system_id <> target_map_system_id` (`ap_map_connection_no_self_loop`).

Hard-deleted on collapse (no soft-delete); attached `ap_map_signature` rows cascade.
