## role.ts

**Purpose:** The three Stage-15 role tables — `ap_role` (registry), `ap_character_role` (membership), `ap_map_role_access` (per-map grant). Together they support corp-title-driven and external (Discord, etc.) per-map access overlays on top of `ap_map.type` + owner FKs.
**File:** `src/db/schema/ap/role.ts`

---

### apRole
`pgTable('ap_role', …)`:
- `id` — `bigserial` PK.
- `source` — `role_source` enum, required (`builtin` / `corp_title` / `external`).
- `external_ref` — `text`, nullable. For `corp_title`, `'<corporation_id>:<title_id>'`. For `external`, the upstream role id. NULL for `builtin`.
- `name` — `text`, required. Canonical name (e.g. the title string from ESI).
- `display_label` — `text`, nullable. Optional human-friendly label; UI falls back to `name`.
- `corporation_id` — `bigint`, nullable, FK → `ap_corporation.id` `ON DELETE CASCADE`. Scopes `corp_title` rows to the issuing corp; NULL for `builtin` / `external`.
- `created_at` — `timestamptz`, default `now()`.

**Constraints:**
- `ap_role_source_external_ref_uq` — unique `(source, external_ref)`. Each upstream identity maps to exactly one role row.
- `ap_role_corporation_id_idx` — btree on `(corporation_id)`. Backs the corp-title picker query (Stage 17).

### apCharacterRole
`pgTable('ap_character_role', …)`:
- `character_id` — `bigint`, FK → `ap_character.id` `ON DELETE CASCADE`.
- `role_id` — `bigint`, FK → `ap_role.id` `ON DELETE CASCADE`.
- `granted_at` — `timestamptz`, default `now()`.
- `granted_by` — `text`, nullable. Provenance: `'corp-title-sync'`, `'<character_id>'` (admin grant), `'discord-sync'`, …

**Constraints:**
- `ap_character_role_pk` — composite PK `(character_id, role_id)`.
- `ap_character_role_role_id_idx` — btree on `(role_id)`. Backs "who holds this role" queries.

`corp_title` rows are owned end-to-end by `syncCharacterAuthz` — it inserts on title-gained and deletes on title-lost. Built-in / external rows are managed by their respective sync paths and never touched by the title-sync.

### apMapRoleAccess
`pgTable('ap_map_role_access', …)`:
- `map_id` — `bigint`, FK → `ap_map.id` `ON DELETE CASCADE`.
- `role_id` — `bigint`, FK → `ap_role.id` `ON DELETE CASCADE`.
- `granted_at` — `timestamptz`, default `now()`.

**Constraints:**
- `ap_map_role_access_pk` — composite PK `(map_id, role_id)`.
- `ap_map_role_access_role_id_idx` — btree on `(role_id)`. Backs "which maps does this role unlock" queries used by `listViewableMaps`.

Semantics: a character holding any role listed for a map gets **view access** to it. Mutation rights are still gated by `ap_corporation_right` + `authz_level` (see `src/lib/auth/rights.ts`) — roles do not by themselves grant arbitrary mutation, and `map_delete`/`map_share` remain owner-or-admin only.
