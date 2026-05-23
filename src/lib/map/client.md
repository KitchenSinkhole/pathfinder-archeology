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
POSTs `/api/map/{mapId}/systems`. POST = the caller awaits the server payload before applying.

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

### fetchWormholeTypes({ mapId, universeSystemId }): Promise<ActionResult<WormholeTypeOption[]>>
GET `/api/map/{mapId}/wormhole-types?systemId=<universeSystemId>`. Results are cached per `(mapId, universeSystemId)` in a module-scoped `Map` for the session — WH catalog filtering is immutable per class, so this avoids re-fetching as the user opens the inspector for different systems.

---

### Depends On
- `sonner` (`toast.error`)
- Types from `@/types`: `ActionResult`, `MapEventPayload`, `WormholeTypeOption`
- Enum value types from `@/lib/map/enumLabels`
