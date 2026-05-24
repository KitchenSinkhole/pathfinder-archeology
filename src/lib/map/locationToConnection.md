## locationToConnection.ts

**Purpose:** Pure jump classifier used by the Stage 12.2 location-poll fan-out. Decides whether a system transition is a gate jump (no map writes) or a wormhole jump (fold onto tracked maps as `system.added` / `connection.create` events).
**File:** `src/lib/map/locationToConnection.ts`

---

### type JumpClass
`'gate' | 'wormhole'`. Only two outcomes today; the rebuild treats every non-gate transition as a wormhole. Rarer cases (cyno, jump bridge, abyssal trace) are not modelled here and land with the broader intel module work in later stages.

### classifyJump({ fromSystemId, toSystemId }): Promise<JumpClass>
Single `EXISTS` probe against `universe_stargate_edge` in **both directions** (defensive against a future SDE ingest that stops mirroring each gate pair). Returns `'gate'` if a row matches, `'wormhole'` otherwise.

`fromSystemId === toSystemId` short-circuits to `'gate'` so the location-poll can call it without a same-system pre-check — same-system means "no jump", which is functionally the same as "ignore this transition".

### gateAdjacencyCondition(from, to)
Drizzle-builder equivalent of the `EXISTS` condition, exposed for callers that want to compose it into a larger query. Not used internally; the raw SQL in `classifyJump` reads more clearly.

### Notes
- `universe_stargate_edge` has its PK on `(from_system_id, to_system_id)` and a secondary index on `to_system_id` (Stage 1). The bidirectional probe hits the PK either way.
- This is a read-only helper — no transaction needed. The poll calls it outside any commit and uses the result to gate whether `foldWormholeJumpOntoMap` runs.
