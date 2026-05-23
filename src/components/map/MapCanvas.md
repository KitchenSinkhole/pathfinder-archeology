## MapCanvas

**Purpose:** Stateful xyflow canvas — renders a map's systems and connections, applies live realtime events, and hosts the route + kill-stats sidebar driven by node selection.
**File:** `src/components/map/MapCanvas.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| data | MapViewData | yes | Initial map + systems + connections (from `loadMapForView`). |
| routes | Record<number, HubRoute[]> | yes | Precomputed hub jumps keyed by EVE system id. |
| stats | Record<number, SystemStatsSummary> | yes | Precomputed 24h stats keyed by EVE system id. |

### Renders
A `ReactFlow` canvas (custom `system` nodes, `connection` edges, `Background`, `Controls`) beside a sidebar with `RouteModule` and `KillStatsModule` for the selected system.

### Behaviour & Interactions
- Read-only: `nodesDraggable`/`nodesConnectable` false, edges non-selectable. `fitView` on load; attribution hidden. `colorMode="dark"`.
- Node selection is local state (`selectedId`); never persisted.
- Seeded from `data` prop into `viewData` state; live events are applied via `applyEvent` reducer.
- `useMapSubscription(Number(data.map.id))` opens the realtime channel for the canvas lifetime.
- On each `lastEvent`, if it's a `mapUpdate` carrying a `MapEventPayload`, the event is applied through `applyEvent`. Applied `eventId`s are recorded in a `Set` ref to deduplicate the initiating tab's own realtime echo (optimistic-reconcile — Stage 9.6).
- Signature events and `map.delete` are no-ops in the reducer; navigation on map deletion is handled by the `mapDeleted` WS task at a higher layer.

### Emits / Calls
- `useMapSubscription` / `useRealtime` — subscribe + consume live events
- `applyEvent` — pure reducer applied on each new `mapUpdate` envelope

### Depends On
- `@xyflow/react`, `./SystemNode`, `./ConnectionEdge`
- `RouteModule`, `KillStatsModule`
- `applyEvent` (`@/lib/map/applyEvent`)
- `mapUpdateLoadSchema` (`@/lib/realtime/protocol`)
- `useMapSubscription`, `useRealtime` (`@/lib/realtime/useRealtime`)

### Local State
- `selectedId: string | null` — selected `ap_map_system.id`.
- `viewData: MapViewData` — mutable copy of map data, updated by realtime events.
- `appliedEventIds: Set<number>` (ref) — dedup set for realtime event ids.
