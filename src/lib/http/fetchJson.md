## fetchJson.ts

**Purpose:** Shared browser-side JSON fetch core for the app's JSON API routes — folds non-2xx and network errors into `{ ok: false, error }` and toasts, so call sites don't duplicate that logic.
**File:** `src/lib/http/fetchJson.ts`

---

### type FetchResult<T>
`{ ok: true; data: T } | { ok: false; error: string }` — the result shape for routes that return `{ ok, data }` with no `eventId` (GET reads and non-map REST mutations like structures).

---

### requestJson<J>(method, url, body?): Promise<J | { ok: false; error: string }>
Generic over the full success union the route returns. Sends `body` as JSON when present, always `credentials: 'same-origin'`. On a null/unparseable body or `json.ok === false`, fires `toast.error` and returns a failure. Used by `src/lib/map/client.ts` (with `ActionResult<T>`, which carries `eventId`) and `src/lib/structures/client.ts` (with `FetchResult<T>`).

**Parameters:**
- `method` — `'GET' | 'POST' | 'PATCH' | 'DELETE'`.
- `url` — route URL.
- `body` — optional JSON-serializable body; omitted for GET/DELETE.

**Returns:** The parsed route JSON typed as `J`, or `{ ok: false, error }` on any failure.
