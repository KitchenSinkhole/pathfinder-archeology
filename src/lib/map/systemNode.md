## systemNode.ts

**Purpose:** Pure read-side helper that produces the full `system.added` event body — `ap_map_system` row flattened with `universe_system` + `universe_constellation` + `universe_region` metadata and the system's static wormhole codes. Shared by user-driven mutations (`src/lib/map/mutations/systems.ts`) and the Stage 12.2 location-poll fold (`src/lib/jobs/locationCommit.ts`).
**File:** `src/lib/map/systemNode.ts`

---

### buildSystemNode(tx, mapSystemId): Promise<MapEventPatch<'system.added'>>
Called inside a `commitMapEvent` `mutate` callback (so the just-inserted/updated row is visible to the transaction's `select`). Returns the patch body matching `mapEventPayloadSchema`'s `system.added` variant — everything the canvas needs to render the node without a follow-up fetch.

### Notes
- **No `import 'server-only'`.** Same precedent as `src/lib/map/mutations/core.ts` (Stage 11.2): this is a low-level read helper consumed by both user-flow code (where the wrapper layer carries the guard) and job-flow code (plain Node, no `react-server` export condition; would crash on the `server-only/index.js` throw).
- Extracted from `mutations/systems.ts` in Stage 12.2 because `addSystem` and the location-poll's per-map fold need the same payload shape; previously inlined inside `systems.ts`.
