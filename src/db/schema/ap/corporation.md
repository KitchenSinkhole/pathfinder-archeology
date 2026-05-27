## corporation.ts

**Purpose:** The `ap_corporation` table — minimal corp registry created on demand to back FK targets for `ap_corporation_right` and `ap_role.corporation_id`.
**File:** `src/db/schema/ap/corporation.ts`

---

### apCorporation
`pgTable('ap_corporation', …)`:
- `id` — `bigint` PK, the EVE corporation id (natural 64-bit key, not generated).
- `name` — `text`, required. Refreshed by `syncCharacterAuthz` whenever a character in this corp is reconciled.
- `alliance_id` — `bigint`, nullable. NPC and unaffiliated player corps have no alliance.
- `last_synced_at` — `timestamptz`, default `now()`. When the row was last refreshed from ESI.

No `active` / `deleted_at` flag — defunct corps stay as historical record so that `ap_corporation_right` and orphaned `ap_role` rows remain referentially valid. Rows are upserted by `syncCharacterAuthz`; nothing else writes to this table.
