## client.ts

**Purpose:** Browser-side fetch wrappers for the Stage 9.4 JSON API routes. The network layer for `MapCanvas`'s optimistic+reconcile flow.
**File:** `src/lib/map/client.ts`

Each helper returns `ActionResult<MapEventPayload>` — same shape as the route — so the caller can feed the success `data` straight into `applyEvent`. The helpers do not touch view state: optimistic apply / rollback / dedupe is orchestrated in `MapCanvas`. On a non-2xx response or network throw, helpers fire a `toast.error` and return `{ ok: false, error }`.

---

### Wire-shape input types

| Type | Used by | Notes |
|---|---|---|
| `UpdateSystemBody` | `updateSystemOnServer` | Mirrors `PATCH /api/map/[mapId]/systems/[systemId]` Zod schema. `rallyAt` is an ISO string. |
| `CreateConnectionBody` | `createConnectionOnServer` | `sourceMapSystemId` / `targetMapSystemId` are `ap_map_system.id` strings (digits). |
| `UpdateConnectionBody` | `updateConnectionOnServer` | |
| `CreateSignatureBody` | `createSignatureOnServer` | `mapSystemId` digits; `expiresAt` ISO string. |
| `UpdateSignatureBody` | `updateSignatureOnServer` | `mapConnectionId` digits or null; `expiresAt` optional ISO. |

---

### addSystemOnServer({ mapId, systemId, positionX?, positionY? }): Promise<ActionResult<MapEventPayload>>
POSTs `/api/map/{mapId}/systems`. POST = the caller awaits the server payload before applying. Drives both the location-poll fold and the manual "add system" dialog (the latter passes a viewport-center `positionX`/`positionY`).

### searchSystemsOnServer({ mapId, query }): Promise<FetchResult<SystemSearchResult[]>>
GET `/api/map/{mapId}/system-search?q=`. Read-only (view rights) so no `eventId`. Feeds the `AddSystemDialog` autocomplete; the caller debounces and the server returns `[]` for queries under 2 chars.

### updateSystemOnServer({ mapId, mapSystemId, patch }): Promise<ActionResult<MapEventPayload>>
PATCH. Intended to be called optimistically (apply locally first, then commit/rollback based on the result).

### removeSystemOnServer({ mapId, mapSystemId }): Promise<ActionResult<MapEventPayload>>
DELETE. Optimistic.

### createConnectionOnServer({ mapId, body }): Promise<ActionResult<MapEventPayload>>
POST. Await-then-apply.

### updateConnectionOnServer({ mapId, connectionId, patch }) / deleteConnectionOnServer({ mapId, connectionId })
PATCH / DELETE on `/api/map/{mapId}/connections/{connectionId}`. Optimistic.

### createSignatureOnServer({ mapId, body }) / updateSignatureOnServer({ mapId, signatureId, patch }) / deleteSignatureOnServer({ mapId, signatureId })
POST / PATCH / DELETE on `/api/map/{mapId}/signatures[/{sigId}]`. Create awaits; update/delete are optimistic.

### pasteSignaturesOnServer({ mapId, body }): Promise<ActionResult<BulkPasteResult>>
POST `/api/map/{mapId}/signatures/bulk`. Bulk-diff a paste against the system's existing sigs and commit add / update / remove (+ optional connection tear-down) atomically. Returns `{ summary, payloads }`; the caller iterates `payloads` to register each `eventId` in its dedupe set and apply each payload locally (the wrapper-level `eventId` is always `0` here because bulk is N-events).

### resolveSignaturesOnServer({ mapId, rows }): Promise<FetchResult<ResolvedSigRow[]>>
POST `/api/map/{mapId}/signatures/resolve`. Preview-only resolver for the paste dialog — returns `(groupId, typeId)` for each `ParsedSigRow`. The bulk POST always re-resolves authoritatively, so a stale preview cannot affect the final commit.

### fetchWormholeTypes({ mapId, universeSystemId }): Promise<ActionResult<WormholeTypeOption[]>>
GET `/api/map/{mapId}/wormhole-types?systemId=<universeSystemId>`. Results are cached per `(mapId, universeSystemId)` in a module-scoped `Map` for the session — WH catalog filtering is immutable per class, so this avoids re-fetching as the user opens the inspector for different systems.

### exportMapOnServer({ mapId }): Promise<FetchResult<MapExportFile>>
GET `/api/map/{mapId}/export` (`map_export` right). Returns the map's current state document; the caller serialises it and triggers the browser download.

### importMapOnServer({ mapId, data }): Promise<ActionResult<ImportResult>>
POST `/api/map/{mapId}/import` (`map_import` right). Merges a `MapExportFile` into the open map and returns the N committed event payloads (wrapper-level `eventId` is `0`); the caller folds each via `applyEvent` and registers its `eventId`.

---

### Depends On
- `sonner` (`toast.error`)
- Types from `@/types`: `ActionResult`, `MapEventPayload`, `WormholeTypeOption`, `BulkPasteOptions`, `BulkPasteResult`, `ParsedSigRow`, `ResolvedSigRow`, `MapExportFile`, `ImportResult`
- Enum value types from `@/lib/map/enumLabels`
