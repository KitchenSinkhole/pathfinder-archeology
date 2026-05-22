## dogma.ts

**Purpose:** Drizzle tables for dogma attributes, per-type attribute values, and admin/bootstrap overrides.
**File:** `src/db/schema/universe/dogma.ts`

Exports: `universeDogmaAttribute`, `universeTypeAttribute`, `universeTypeOverride`. See `src/db/schema.md`. `universeTypeOverride` seeds the WH scan-strength (attr 3974) values missing from ESI; the effective view (`views.ts`) coalesces overrides over `universeTypeAttribute`.
