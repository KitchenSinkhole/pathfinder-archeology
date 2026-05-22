## MapCanvas

**Purpose:** Read-only xyflow canvas client wrapper — renders a map's systems and connections and hosts the route + kill-stats sidebar, driven by node selection.
**File:** `src/components/map/MapCanvas.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| data | MapViewData | yes | Map + systems + connections (from `loadMapForView`). |
| routes | Record<number, HubRoute[]> | yes | Precomputed hub jumps keyed by EVE system id. |
| stats | Record<number, SystemStatsSummary> | yes | Precomputed 24h stats keyed by EVE system id. |

### Renders
A `ReactFlow` canvas (custom `system` nodes, `connection` edges, `Background`, `Controls`) beside a sidebar with `RouteModule` and `KillStatsModule` for the selected system.

### Behaviour & Interactions
- Read-only: `nodesDraggable`/`nodesConnectable` false, edges non-selectable. `fitView` on load; attribution hidden. `colorMode="dark"` so xyflow built-in chrome (Controls, etc.) matches the app's permanent dark theme.
- Node selection is local state (`selectedId`); never persisted. Selecting a node maps it to its EVE `systemId` to look up `routes`/`stats` for the sidebar.
- `useMapSubscription(Number(data.map.id))` opens this map's realtime channel for the canvas's lifetime (Stage 8). Live updates are not yet applied to the canvas — that is Stage 9.

### Depends On
- `@xyflow/react`, `./SystemNode`, `./ConnectionEdge`, `RouteModule`, `KillStatsModule`, `useMapSubscription` (`@/lib/realtime/useRealtime`).

### Local State
- `selectedId: string | null` — selected `ap_map_system.id`.
