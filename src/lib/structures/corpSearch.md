## corpSearch.ts

**Purpose:** ESI-backed corporation name search for the structure-intel owner picker.
**File:** `src/lib/structures/corpSearch.ts`

---

### searchCorporations(query: string, characterId: bigint): Promise<CorpSearchResult[]>
Searches EVE corporations by partial name. Returns `[]` for queries under 3 chars (ESI's minimum) without a round trip. `search` (category `corporation`, runs under `characterId`'s token — needs scope `esi-search.search_structures.v1`) → up to 25 ids. Names are read from the `universe_corporation` cache (`freshCachedCorporationNames`); only uncached/stale ids cost a `getUniverseNames` call, and those are written back (`upsertCorporations`). Results are ordered prefix-match-first then alphabetical.

Throws the underlying ESI error (breaker / http / token / decode) — the route translates it. A 403 means the caller's token predates the search scope and they must re-authenticate.

**Returns:** `CorpSearchResult[]` — `{ id: number; name: string }` per matching corp.

### CorpSearchResult
`{ id: number; name: string }` — re-exported from `src/types`.
