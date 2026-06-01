## applyEvent.ts

**Purpose:** Pure reducer that applies one realtime `MapEventPayload` to a `MapViewData` snapshot and returns the next state.
**File:** `src/lib/map/applyEvent.ts`

---

### applyEvent(state: MapViewData, payload: MapEventPayload): MapViewData

Dispatches on `payload.kind` and returns a new `MapViewData` without mutating the input. Called on the client inside `MapCanvas.tsx`'s `useState` + `useEffect` event loop.

**Parameters:**
- `state` — current canvas view data (map header, visible systems, connections).
- `payload` — a validated `MapEventPayload` from a `mapUpdate` WS envelope.

**Returns:** A new `MapViewData` with the event applied, or the original `state` reference when the event has no canvas representation (`map.create`, `map.delete`, `map.restore`, `map.purge`).

**Per-kind behaviour:**
- `system.added` — upserts the full system node body into `state.systems` (handles both new placements and re-activations of previously-removed systems).
- `system.removed` — filters the system out of `state.systems` (rows persist server-side at `visible=false`; the canvas just stops showing them). Signatures whose `mapSystemId` matches the removed system are intentionally retained — the DB rows persist (cascade only on hard row delete) and will reappear in the inspector if the system is re-added.
- `system.updated` — merges the patch into the matching system; canvas-visible fields applied: `alias`, `tag`, `status`, `locked`, `rallyAt`, `positionX`, `positionY`. `intelNotes` is not in `MapViewData` and is silently ignored.
- `connection.create` — appends the full edge body to `state.connections`.
- `connection.update` — merges the patch into the matching connection; `eolAt` is applied when present (so the canvas EOL countdown reflects the new stamp without a refetch).
- `connection.delete` — removes the connection by id.
- `map.update` — updates `state.map.name` if present in the patch; other settings flags have no canvas representation.
- `signature.create` — upserts the full signature body into `state.signatures`.
- `signature.update` — merges the patch into the matching signature by id; only present keys overwrite. Includes `groupKey`, `typeId`, the display-only `wormholeCode` (resolved server-side from `universe_wormhole.name` when `typeId` changes), and `updatedAt`.
- `signature.delete` — removes the signature by id.
- `map.create`, `map.delete`, `map.restore`, `map.purge` — return `state` unchanged. The last two are Stage 16.2 admin-only events; non-admin viewers never see a soft-deleted map open, so there is no canvas state to reconcile.

### Depends On
- `MapViewData`, `MapSystemNode`, `MapConnectionEdge`, `MapSignature` — types from `@/types`
- `MapEventPayload` — type from `@/lib/realtime/protocol`
