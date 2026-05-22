## index.ts (types)

**Purpose:** Canonical home for shared domain types. Re-exports Drizzle-inferred row types for the `universe_*` and `ap_*` tables.
**File:** `src/types/index.ts`

For each table `X` exports `X` (`InferSelectModel`) and `NewX` (`InferInsertModel`), e.g. `UniverseSystem` / `NewUniverseSystem`. Import row types from here, never re-infer inline. Stage 2 adds `ApUser` / `NewApUser` and `ApCharacter` / `NewApCharacter`. Stage 6 adds the map schema row types: `ApMap`, `ApMapSystem`, `ApMapConnection`, `ApMapSignature`, `ApMapEvent`, `ApEventKind` (each with a `New…` insert variant).

Stage 3 re-exports the realtime wire-contract types (`Envelope`, `ServerToClientTask`, `ClientToServerTask`, `ServerToClientMessage`, `ClientToServerMessage` — schemas in `src/lib/realtime/protocol.ts`) and the ESI opKey types (`OpKey`, `OpDef` — map in `src/lib/esi/opkeys.ts`).

Stage 4 re-exports the ESI decoded-response types (`EsiStatus`, `EsiLocation`, `EsiRoute` — schemas in `src/lib/esi/decoders`).

Stage 8 re-exports `RealtimeStatus` (`'connecting' | 'open' | 'closed' | 'degraded'` — the client realtime connection state from `src/lib/realtime/useRealtime.tsx`).
