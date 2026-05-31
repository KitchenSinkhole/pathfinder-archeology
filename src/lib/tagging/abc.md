## abc.ts

**Purpose:** Scheme A "ABC" — per-WH-class sequential-letter tagging (Stage 17.10). Pure / db-free.
**File:** `src/lib/tagging/abc.ts`

---

### abcStrategy: TagStrategy
- `tagOnAdd(ctx, subject)` — returns the lowest free letter for the subject's WH class, or `null` for non-wormhole systems. Taggable classes are the `Cn` labels from `deriveSecurityLabel` (wormhole space); k-space (`H`/`L`/`0.0`), Abyssal (`A`), and Pochven (`P`) are left untagged. Each class has its own independent A, B, C… sequence; the lowest free ordinal is always chosen, so deleting a tagged system reclaims its letter.
- `tagOnConnect()` — always `null` (ABC is topology-independent).
- `availableTags(ctx)` — `{ scheme: 'abc', perClass }` listing the next 3 free letters for C1–C6 plus any other taggable class present on the map.

Letters use bijective base-26 (A…Z, AA, AB…) so a class with >26 holes keeps assigning. Internal helpers (`letterForIndex`, `indexForLetter`, `lowestFreeLetters`) are not exported.
