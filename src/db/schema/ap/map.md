## map.ts

**Purpose:** The `ap_map` table — the root entity that owns every per-map system, connection, signature, and event.
**File:** `src/db/schema/ap/map.ts`

---

### apMap
`pgTable('ap_map', …)`:
- `id` — `bigserial` PK.
- `scope` — `map_scope` enum, required (which kinds of systems are allowed).
- `type` — `map_type` enum, required (private/corp/alliance).
- `name` — `text`, required; `icon` — `text`, nullable.
- `delete_expired_connections`, `delete_eol_connections`, `track_abyssal_jumps`, `log_activity` — `boolean`, default `true`. Per-map behaviour toggles.
- `next_bookmarks` — `jsonb`, default `'[]'`.
- `owner_character_id` — `bigint`, nullable, FK → `ap_character.id` `ON DELETE SET NULL`. Required when `type='private'`; NULL otherwise. Stage 15.
- `owner_corporation_id` — `bigint`, nullable. Required when `type='corp'`; NULL otherwise. No FK (no `ap_corporation` until Stage 15). Stage 15.
- `owner_alliance_id` — `bigint`, nullable. Required when `type='alliance'`; NULL otherwise. No FK. Stage 15.
- `created_at` / `updated_at` — `timestamptz`, default `now()`.
- `deleted_at` — `timestamptz`, nullable. **Two-phase deletion**: `NULL` = active; non-null = soft-deleted (30-day grace before a cron hard-purge). No `active` boolean per CLAUDE.md lifecycle rule.

**Constraints:**
- `ap_map_owner_matches_type_chk` — `CHECK` (added in migration 0013) enforcing the mutually-exclusive owner column matches `type`. Allows all-NULL during the transition for any pre-Stage-15 rows; those rows are treated as admin-only by `src/lib/auth/rights.ts`.

Legacy toggles `persistentAliases` / `persistentSignatures` / `logHistory` are dropped; webhook config normalises into `ap_map_webhook` in a later stage.
