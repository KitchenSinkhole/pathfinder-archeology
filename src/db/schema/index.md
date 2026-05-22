## index.ts

**Purpose:** Schema barrel — re-exports every `universe_*` table and the effective-dogma view for the Drizzle client and migration tooling.
**File:** `src/db/schema/index.ts`

Re-exports `universe/{geography,items,dogma,statics,views}`. Imported as `* as schema` by `src/db/client.ts` and globbed by `drizzle.config.ts`.
