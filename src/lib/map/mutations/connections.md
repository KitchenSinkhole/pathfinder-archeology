## connections.ts

**Purpose:** Connection-level map mutations (create / delete / update), each a single `commitMapEvent` call. Connections are hard-deleted on collapse (wormholes don't come back).
**File:** `src/lib/map/mutations/connections.ts`

---

### createConnection(input: CreateConnectionInput): Promise<ActionResult<MapEventPayload>>
Inserts one `ap_map_connection` row between two map systems. Flag defaults: `massStatus = 'fresh'`, `jumpMassClass = null`, all booleans `false`; `eol_at` is stamped only when `isEol` is created true. Emits `connection.create` with the full edge body (id/source/target/scope/massStatus/jumpMassClass + flags).

**Parameters:**
- `input.sourceMapSystemId` / `input.targetMapSystemId` — endpoint `ap_map_system.id`s.
- `input.scope` — required `connection_scope` (wh|stargate|jumpbridge|abyssal).
- `input.massStatus`, `input.jumpMassClass`, `input.isEol`, `input.preserveMass`, `input.isRolling` — optional flag overrides.
- `input.mapId`, `input.characterId` — map + audit FK.

---

### deleteConnection(input: DeleteConnectionInput): Promise<ActionResult<MapEventPayload>>
Hard-deletes the `ap_map_connection` row matching `(connectionId, mapId)`; attached `ap_map_signature` rows cascade. Throws (rolls back) if no matching row. Emits `connection.delete` → `{ id }`. Accepts optional `input.tx` to join an outer transaction (used by `bulkSignatures.ts` when tearing down WH connections orphaned by `removeOrphanedConnections`).

---

### updateConnection(input: UpdateConnectionInput): Promise<ActionResult<MapEventPayload>>
Updates connection flags; only keys present in `input.patch` change (presence via `in`, so `null`/`false` are honored). Toggling `isEol` true stamps `eol_at = now()` the first time it goes EOL and preserves the original timestamp on a repeat true; setting it false clears `eol_at` to null. `eol_at` crosses the wire as an ISO string (or null) in the payload. Emits `connection.update` → `{ id, ...changed }`.

**Parameters:**
- `input.patch` — `UpdateConnectionPatch`: `scope`, `massStatus`, `jumpMassClass`, `isEol`, `preserveMass`, `isRolling` (all optional).

---

### type CreateConnectionInput / DeleteConnectionInput / UpdateConnectionInput / UpdateConnectionPatch
Input bags for the three helpers. Re-exported from `src/types/index.ts`.

### Depends On
- `commitMapEvent` (`./core`) — the single commit primitive.
- `apMapConnection` (Drizzle schema).
- `mapEventPayloadSchema` variants `connection.create` / `connection.delete` / `connection.update` (`@/lib/realtime/protocol`).
