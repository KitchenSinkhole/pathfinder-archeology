## structure.ts

**Purpose:** The `ap_structure` table — manual structure-intel: one row per player-owned structure spotted in a system. System-scoped, deployment-global (shared across maps).
**File:** `src/db/schema/ap/structure.ts`

---

### apStructure
`pgTable('ap_structure', …)`:
- `id` — `bigserial` PK, app-generated (no natural EVE id; manual entry).
- `system_id` — `integer` FK → `universe_system.id` `ON DELETE RESTRICT`.
- `name` — `text`, not null. User-typed structure name.
- `structure_type_id` — `integer` FK → `universe_type.id` `ON DELETE RESTRICT`. The Upwell structure type (Astrahus, Fortizar, Keepstar, Raitaru, Azbel, Sotiyo, Athanor, Tatara, Ansiblex, …). Real FK because type is static SDE data.
- `owner_name` — `text`, nullable. Free-text owner intel (not authoritatively resolvable).
- `notes` — `text`, nullable. Free-text intel.
- `created_by_character_id` — `bigint` FK → `ap_character.id` `ON DELETE SET NULL` (audit; never cascade-wipe intel when a character is erased).
- `created_at` / `updated_at` — `timestamptz`, default `now()`.

**Index:** `system_id` (`ap_structure_system_id_idx`) for the per-system module read.

### Notes
- **Manual entry, not ESI.** ESI `getUniverseStructure` only returns structures the calling character can dock at, so it cannot supply intel on other corps' structures. The Stage 11.6 `structure-resolve` ESI job was retired in Stage 17.1 rather than implemented. See `docs/plans/stage-17-ui-catchup.md`.
