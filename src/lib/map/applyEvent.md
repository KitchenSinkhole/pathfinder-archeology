## applyEvent.ts

**Purpose:** Pure reducer that applies one realtime `MapEventPayload` to a `MapViewData` snapshot and returns the next state.
**File:** `src/lib/map/applyEvent.ts`

---

### applyEvent(state: MapViewData, payload: MapEventPayload): MapViewData

Dispatches on `payload.kind` and returns a new `MapViewData` without mutating the input. Called on the client inside `MapCanvas.tsx`'s `useState` + `useEffect` event loop.

**Parameters:**
- `state` — current canvas view data (map header, visible systems, connections).
- `payload` — a validated `MapEventPayload` from a `mapUpdate` WS envelope.

**Returns:** A new `MapViewData` with the event applied, or the original `state` reference when the event has no canvas representation (signature events, `map.create`, `map.delete`).

**Per-kind behaviour:**
- `system.added` — upserts the full system node body into `state.systems` (handles both new placements and re-activations of previously-removed systems).
- `system.removed` — filters the system out of `state.systems` (rows persist server-side at `visible=false`; the canvas just stops showing them).
- `system.updated` — merges the patch into the matching system; only the canvas-visible fields are applied (`alias`, `tag`, `status`, `locked`, `positionX`, `positionY`). `intelNotes` and `rallyAt` are not in `MapViewData` and are silently ignored.
- `connection.create` — appends the full edge body to `state.connections`.
- `connection.update` — merges the patch into the matching connection; `eolAt` is stripped (not part of `MapConnectionEdge`).
- `connection.delete` — removes the connection by id.
- `map.update` — updates `state.map.name` if present in the patch; other settings flags have no canvas representation.
- `signature.*`, `map.create`, `map.delete` — return `state` unchanged.

### Depends On
- `MapViewData`, `MapSystemNode`, `MapConnectionEdge` — types from `@/types`
- `MapEventPayload` — type from `@/lib/realtime/protocol`
