## corporations.ts

**Purpose:** Read/write helpers for the `universe_corporation` corp-name cache.
**File:** `src/lib/structures/corporations.ts`

---

### CORP_CACHE_TTL_MS
`30 days`. Cached names older than this are re-resolved from ESI on the next search.

### freshCachedCorporationNames(ids: number[]): Promise<Map<number, string>>
Cached, still-fresh corp names for `ids`, keyed by id. Stale/uncached ids are absent (the caller resolves those from ESI). Returns an empty map for an empty input.

### upsertCorporations(rows: { id: number; name: string }[]): Promise<void>
Upserts cache rows, refreshing `name` + `last_fetched_at` on conflict. No-op on empty input. Used by the corp search (to memoize resolved names) and the structure mutations (to guarantee the `owner_corporation_id` FK target exists before insert).
