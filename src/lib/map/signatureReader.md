## signatureReader.ts

**Purpose:** Server-only resolver that joins parsed probe-scanner rows against `universeGroup` / `universeType`. The pure parser lives next door in `signatureParser.ts` so it can be imported from client components without pulling the DB client into the bundle.
**File:** `src/lib/map/signatureReader.ts`

---

### resolveSignatureRows(rows: ParsedSigRow[]): Promise<ResolvedSigRow[]>
Two round-trips total: one `universe_group WHERE name IN (...)` and one `universe_type WHERE (groupId, name) IN (...)`. Returns each input row enriched with `{ groupId, typeId }`; unresolvable fields stay `null` so partial scans still flow through the rest of the pipeline.

System-aware classification (K-space vs WH-space) isn't needed today — sig group and type names are unique enough across the SDE. Add a system-id parameter only when a real divergence appears.

---

### Types
- `ResolvedSigRow = ParsedSigRow & { groupId: number | null; typeId: number | null }`
- `ParsedSigRow` is re-exported from `./signatureParser` (defined there).

Both re-exported from `src/types/index.ts`.

### Why no WH-type code resolution
The probe scanner *never* emits the wormhole type code (`A239`, `K162`, …) in the paste — that's only knowable after warping in and opening "Show Info" on the WH. The existing `WormholeTypeSelect` dropdown in `SignatureModule` stays the user-driven entry point for the code.
