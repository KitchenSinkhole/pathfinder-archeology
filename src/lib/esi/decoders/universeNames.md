## universeNames.ts

**Purpose:** Zod decoder for `post_universe_names` (`getUniverseNames`) — batch id→name/category resolution for ids absent from `universe_*` (e.g. kill victims).
**File:** `src/lib/esi/decoders/universeNames.ts`

---

### universeNamesSchema
Parses the response array of `{ id, name, category }`. `category` decoded as a plain string (CCP enum: `character` / `corporation` / `alliance` / `inventory_type` / …).

**Exports:** `universeNamesSchema`, `EsiUniverseNames`.
