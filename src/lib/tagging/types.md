## types.ts

**Purpose:** The pure, db-free contract every auto-tagging scheme implements, plus the read-only `TagContext` snapshot the schemes operate over (Stage 17.10).
**File:** `src/lib/tagging/types.ts`

---

### ActiveScheme
`'abc' | '0121'` — the two schemes that run a strategy. `'none'` short-circuits in `service.ts` before any strategy is consulted.

### TagSystem
`{ mapSystemId: bigint; systemId: number; tag: string | null; securityClass: string | null }` — one visible system in the snapshot. `securityClass` is the `universe_system.security` label from `deriveSecurityLabel` (`C1`..`Cn` wormhole, `H`/`L`/`0.0` k-space, `A`/`P`, null). `tag` is the bare token (e.g. `B`, `121`).

### TagEdge
`{ source: bigint; target: bigint }` — one connection, endpoints as `ap_map_system.id`. Direction-agnostic.

### TagContext
`{ scheme: ActiveScheme; homeMapSystemId: bigint | null; systems: TagSystem[]; connections: TagEdge[] }` — a map's tag-relevant state. `systems` is visible systems only (so soft-deleted rows drop out and free their tag).

### AvailableTags
Discriminated by `scheme`. `abc` → `perClass: { classLabel; next: string[] }[]`. `0121` → `perParent: { parentMapSystemId: string | null; parentLabel: string; next: string }[]`. The `TagsModule` panel view-model.

### TagStrategy
- `tagOnAdd(ctx, subject): string | null` — discovery-time tag (ABC from class; 0121 → null).
- `tagOnConnect(ctx, { source, target }): { mapSystemId; tag } | null` — tag for a newly-connected untagged child (0121 from the resolved parent; ABC → null).
- `availableTags(ctx, selectedMapSystemId): AvailableTags` — the panel's next-available view-model.
