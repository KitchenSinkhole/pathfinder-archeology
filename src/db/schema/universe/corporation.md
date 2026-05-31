## corporation.ts

**Purpose:** The `universe_corporation` table — an ESI-fed cache of corporation id → name, populated on demand by the structure-owner search.
**File:** `src/db/schema/universe/corporation.ts`

---

### universeCorporation
`pgTable('universe_corporation', …)`:
- `id` — `bigint` PK, the natural EVE corporation id (not generated).
- `name` — `text`, not null. Last resolved corp name.
- `last_fetched_at` — `timestamptz`, default `now()`. When the name was last resolved; drives opportunistic re-resolution during search.

### Notes
- **Mutable ESI cache, not static SDE** — lives beside the static `universe_*` tables like `universe_sovereignty_map`. Populated/refreshed by the structure-owner corp search (`src/lib/structures/corporations.ts`).
- **Distinct from `ap_corporation`.** `ap_corporation` holds *member* corps (rights-matrix FK target, must stay limited to corps the deployment belongs to). `universe_corporation` caches *any* searched corp and is the FK target for `ap_structure.owner_corporation_id`.
