## corporation_right.ts

**Purpose:** The `ap_corporation_right` table — per-corp rights matrix replacing the legacy three-way `corporation_right(corp, role, right)` join with a two-column key plus a `min_authz_level` threshold.
**File:** `src/db/schema/ap/corporation_right.ts`

---

### apCorporationRight
`pgTable('ap_corporation_right', …)`:
- `corporation_id` — `bigint`, FK → `ap_corporation.id` `ON DELETE CASCADE`.
- `right` — `map_right` enum, required. One of the six values: `map_create | map_update | map_delete | map_import | map_export | map_share`.
- `min_authz_level` — `authz_level` enum, required. A character in this corp may exercise the right iff their `authz_level` ordinal is `>= min_authz_level` (`member` < `manager` < `admin`).

**Constraints:**
- `ap_corporation_right_pk` — composite PK `(corporation_id, right)`. At most one threshold per right per corp.

**Reading rule (`src/lib/auth/rights.ts`):**
- `map_create` — checked against the **actor's own corp**: any member with the required `authz_level` may create maps.
- All five per-map rights (`map_update`, `map_delete`, `map_share`, `map_import`, `map_export`) — for corp / alliance maps, the actor must be a member of the owning entity AND hold the right via this matrix on their own corp. Private maps don't consult this table at all — they are owner-or-admin only. Closes SPEC §11 Q8 by codifying the right check the legacy controller layer skipped.

No `granted_at` / `granted_by` columns — rights are admin-panel-managed reference data with no audit trail in this stage; `ap_map_event` already carries map-level mutation history. If audit becomes required later it's a follow-up column add.
