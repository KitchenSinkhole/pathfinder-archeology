## statics.ts

**Purpose:** Drizzle table mapping wormhole systems to their static-connection wormhole types.
**File:** `src/db/schema/universe/statics.ts`

Exports: `universeSystemStatic`. PK `(system_id, type_id)`, both CASCADE FKs. Seeded from vendored community CSV (WH statics are not in the official SDE).
