## routes.ts

**Purpose:** Resolve a swagger `operationId` to its HTTP method, version-prefixed path template, and param names by parsing `docs/ESI/swagger.json` at runtime (server-only, memoized).
**File:** `src/lib/esi/routes.ts`

The single source of truth is the checked-in swagger; the client parses it rather than duplicating method/path data, so ESI route drift surfaces as a thrown error here.

---

### resolveRoute(operationId: string): ResolvedRoute
Looks up the operation in the memoized swagger index. Builds the index lazily on first call (`readFileSync` + `JSON.parse` of `docs/ESI/swagger.json`, walking `paths`). Only `get`/`post` operations are indexed.

**Returns:** `{ method, path, pathParams, queryParams }`.
**Throws:** if the `operationId` is absent from the swagger (the opKey test guards the known set).

### __resetRouteIndexForTest(): void
Drops the memoized index so a fresh parse can be observed in tests.

### ResolvedRoute
- `method: 'get' | 'post'`
- `path: string` — version-prefixed template with `{param}` placeholders.
- `pathParams: string[]` — `{…}` path param names, template order.
- `queryParams: string[]` — accepted query-string param names.
