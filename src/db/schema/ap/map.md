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
- `created_at` / `updated_at` — `timestamptz`, default `now()`.
- `deleted_at` — `timestamptz`, nullable. **Two-phase deletion**: `NULL` = active; non-null = soft-deleted (30-day grace before a cron hard-purge). No `active` boolean per CLAUDE.md lifecycle rule.

Legacy toggles `persistentAliases` / `persistentSignatures` / `logHistory` are dropped; webhook config normalises into `ap_map_webhook` in a later stage.
