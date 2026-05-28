## index.ts (types)

**Purpose:** Canonical home for shared domain types. Re-exports Drizzle-inferred row types for the `universe_*` and `ap_*` tables.
**File:** `src/types/index.ts`

For each table `X` exports `X` (`InferSelectModel`) and `NewX` (`InferInsertModel`), e.g. `UniverseSystem` / `NewUniverseSystem`. Import row types from here, never re-infer inline.

Stage 3 re-exports realtime wire-contract types and ESI opKey types.

Stage 4 re-exports the ESI decoded-response types.

Stage 8 re-exports `RealtimeStatus`.

Stage 9 re-exports map-event payloads, mutation result/input types, signature parser/resolver types, and wormhole-catalog lookup results.

Stage 13 adds `UniverseSovereigntyMap` / `UniverseFactionWarSystem`, ESI sov/FW decoded-response types, and read-side integration summaries (`SystemIntelSummary`, `SovereigntyIntel`, `FactionWarIntel`, `RecentKillSummary`, `EveScoutConnectionSummary`, `ChangelogRelease`).

Stage 16.7 adds `SignatureGroupKey` (the `signature_group_key` pgEnum) and `SignatureGroupOption` for the scanner-level signature group catalog. The corresponding column on `ap_map_signature` is `groupKey: SignatureGroupKey | null` (replacing the prior `groupId` FK to `universe_group`).
