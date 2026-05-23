## utils.ts

**Purpose:** Shared guard helpers for the `/api/map/**` route layer — id parsing and map-existence validation.
**File:** `src/app/api/map/utils.ts`

---

### parseBigInt(s: string): bigint | null
Parses a URL segment as a positive-integer bigint. Returns `null` when the string is not a valid positive integer.

---

### guardMap(rawId: string): Promise<{ mapId: bigint } | null>
Verifies that a map exists and is not soft-deleted (`deleted_at IS NULL`). Returns `{ mapId }` on success, or `null` when the map is missing or already deleted. Route handlers should return HTTP 404 on null.
