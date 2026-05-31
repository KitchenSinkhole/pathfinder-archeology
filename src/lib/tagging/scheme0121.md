## scheme0121.ts

**Purpose:** Scheme B "0121" — positional chain numbering off the Home system (Stage 17.10). Pure / db-free.
**File:** `src/lib/tagging/scheme0121.ts`

---

### scheme0121Strategy: TagStrategy
- `tagOnAdd()` — always `null` (the parent is unknown until a connection lands).
- `tagOnConnect(ctx, { source, target })` — resolves the parent (the Home endpoint, else the tagged endpoint) and the untagged child, then returns `{ child.mapSystemId, parentTag + nextFreeIndex }`. Home's children use prefix `''` (first child off Home → `1`). Returns `null` unless exactly one endpoint is a valid parent and the other is an untagged non-Home child, or if the parent isn't yet rooted to Home. Indices reclaim per-parent because the "next free index" is the lowest `i` whose `parentTag+i` string is not currently in use.
- `availableTags(ctx, selectedMapSystemId)` — `{ scheme: '0121', perParent }`: always Home's next root child, plus the selected system's next child when it is a tagged non-Home node.
