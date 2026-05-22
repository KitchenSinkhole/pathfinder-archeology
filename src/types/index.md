## index.ts (types)

**Purpose:** Canonical home for shared domain types. Re-exports Drizzle-inferred row types for every `universe_*` table.
**File:** `src/types/index.ts`

For each table `X` exports `X` (`InferSelectModel`) and `NewX` (`InferInsertModel`), e.g. `UniverseSystem` / `NewUniverseSystem`. Import row types from here, never re-infer inline. `pf_*` types land in later stages.
