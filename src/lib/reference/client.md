## client.ts

**Purpose:** Browser-side fetch helpers for the static reference dialogs.
**File:** `src/lib/reference/client.ts`

`'use client'`.

---

### fetchWormholeJumpInfo(): Promise<FetchResult<WormholeJumpInfoRow[]>>
GETs `/api/reference/wormholes` via the shared `requestJson` core. Memoises the first successful response in a module-level cache (the catalog is immutable per session) so the Jump Info dialog reopens without a re-fetch. On a non-2xx / network error returns `{ ok: false, error }` (and the shared core toasts).
