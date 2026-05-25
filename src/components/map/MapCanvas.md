## MapCanvas

**Purpose:** Stateful editable xyflow canvas — renders systems and connections, applies realtime events, orchestrates optimistic + reconcile mutations against the Stage 9.4 API, and drives the sidebar inspector.
**File:** `src/components/map/MapCanvas.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| data | MapViewData | yes | Initial map + systems + connections + signatures (from `loadMapForView`). |
| routes | Record<number, HubRoute[]> | yes | Precomputed hub jumps keyed by EVE system id. |
| stats | Record<number, SystemStatsSummary> | yes | Precomputed 24h kill stats keyed by EVE system id. |

### Renders
A `ReactFlow` canvas (custom `system` nodes, `connection` edges, `Background`, `Controls`) beside a sidebar containing `InspectorModule`, `RouteModule`, and `KillStatsModule`.

### Behaviour & Interactions
- `viewData` is seeded from `data` and mutated by both realtime events and local optimistic patches; the canvas is the single source of canvas-render state.
- `appliedEventIds` ref dedupes the initiating tab's own realtime echo by `eventId`.
- `runOptimistic(optimisticPayload, run)` snapshots `viewData`, applies the payload through `applyEvent` locally, fires the network call, and either records the returned `eventId` (success) or restores the snapshot (failure). Used for PATCH / DELETE.
- `awaitServer(run)` posts and, on success, applies the server's `MapEventPayload` through `applyEvent` and records its `eventId`. Used for POST.
- `onBulkPaste(payloads)` (passed down to `SignaturePasteDialog` via `InspectorModule`) loops the N committed payloads, registers every `eventId` in `appliedEventIds`, and folds each through `applyEvent` in commit order — the bulk equivalent of `awaitServer` for the signature-paste flow.
- Nodes are managed in xyflow's "controlled" pattern: `nodes` is a `useState`, and `onNodesChange` applies xyflow's `NodeChange[]` through `applyNodeChanges`. This is what makes drag visually smooth — without an `onNodesChange` handler, xyflow's drag/position events have nowhere to land and nodes don't move until release. A reconcile `useEffect` syncs `viewData.systems` + `selected` + `onAliasOrTagCommit` into the nodes state, preserving each node's `dragging` position and xyflow-internal fields (`measured`, etc.) by spreading the existing entry — without that, every sync would re-measure and nodes would flicker out.
- Drag: `nodesDraggable` is on; `onNodesChange` updates the position live (so the node follows the cursor); `onNodeDragStop` PATCHes `positionX`/`positionY` optimistically through `viewData` (which the reconcile effect then folds back into the nodes state).
- Connect: `nodesConnectable` is on and `connectionMode={ConnectionMode.Loose}` so any of `SystemNode`'s four side handles can act as either source or target during drag. `onConnect` POSTs a new wormhole connection (default scope `wh`), then applies the server payload. (Rendering of the edge ignores which specific handle the user dragged from — `ConnectionEdge` snaps to whichever pair of sides face each other.)
- Selection: `onNodeClick` / `onEdgeClick` / `onPaneClick` write a `SelectionRef = { kind: 'system' | 'connection', id } | null` into local state, which feeds `InspectorModule` and the route / kill-stats modules. The `selected` flag is reflected back into each xyflow node/edge object so rebuilding the arrays on `viewData` change (e.g. an optimistic inspector patch) does not wipe selection. (We can't rely on `onSelectionChange`: with controlled `nodes`/`edges` and no `onNodesChange`, xyflow mutates its internal `nodeLookup` directly without a zustand `set()`, so `onSelectionChange` only fires as a side effect of unrelated re-renders — which made a still click take two attempts to select.)
- Alias and tag: the system tile's `InlineTextEdit` calls back into `MapCanvas`'s `onSystemPatch` via the per-node `onAliasOrTagCommit` injected through `data`.
- Toasts: client helpers in `@/lib/map/client` surface server errors as `toast.error` before returning the failure result; `MapCanvas` only handles rollback.

### Emits / Calls
- `onNodesChange` — xyflow callback; applies `NodeChange[]` to the nodes state via `applyNodeChanges`.
- `useMapSubscription` / `useRealtime` — subscribe + consume live events.
- `applyEvent` — pure reducer applied for every event and every optimistic patch.
- `@/lib/map/client` — all eight mutation wrappers + `fetchWormholeTypes` (via the inspector).

### Depends On
- `@xyflow/react`, `./SystemNode`, `./ConnectionEdge`
- `RouteModule`, `KillStatsModule`, `InspectorModule`
- `applyEvent` (`@/lib/map/applyEvent`)
- `mapUpdateLoadSchema` (`@/lib/realtime/protocol`)
- `useMapSubscription`, `useRealtime` (`@/lib/realtime/useRealtime`)
- All mutation wrappers in `@/lib/map/client`

### Local State
- `selected: SelectionRef | null` — currently selected system or connection.
- `viewData: MapViewData` — mutable canvas state; updated by realtime events + optimistic patches.
- `nodes: Node<SystemNodeData>[]` — xyflow's controlled nodes state; mutated by `applyNodeChanges` (drag, measure, selection) and reconciled from `viewData.systems` via a sync effect.
- `appliedEventIds: Set<number>` (ref) — dedup set for realtime event ids and committed optimistic eventIds.
