## MapCanvas

**Purpose:** Stateful editable xyflow canvas — renders systems and connections, applies realtime events, orchestrates optimistic + reconcile mutations against the Stage 9.4 API, and drives the sidebar inspector.
**File:** `src/components/map/MapCanvas.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| data | MapViewData | yes | Initial map + systems + connections + signatures (from `loadMapForView`). |
| routes | Record<number, HubRoute[]> | yes | Precomputed hub jumps keyed by EVE system id. |
| stats | Record<number, SystemStatsSummary> | yes | Precomputed 24h kill stats keyed by EVE system id. |
| intel | Record<number, SystemIntelSummary> | yes | Read-side integration intel keyed by EVE system id. |

### Renders
A two-column layout: the wide left column stacks the `ReactFlow` canvas (custom `system` nodes, `connection` edges, `Background`, `Controls`) above the `SignatureModule` panel bound to the currently selected system (renders an empty-state when nothing is selected). The narrow right column is a fixed-width sidebar (`w-80`) containing `InspectorModule`, `RouteModule`, `IntelModule`, and `KillStatsModule`. The map sits at `h-[78vh]`; sidebar uses `shrink-0` and the map column uses `min-w-0` so the map truly fills the leftover horizontal space.

### Behaviour & Interactions
- `viewData` is seeded from `data` and mutated by both realtime events and local optimistic patches; the canvas is the single source of canvas-render state.
- `appliedEventIds` ref dedupes the initiating tab's own realtime echo by `eventId`.
- `runOptimistic(optimisticPayload, run)` snapshots `viewData`, applies the payload through `applyEvent` locally, fires the network call, and either records the returned `eventId` (success) or restores the snapshot (failure). Used for PATCH / DELETE.
- `awaitServer(run)` posts and, on success, applies the server's `MapEventPayload` through `applyEvent` and records its `eventId`. Used for POST.
- `onBulkPaste(payloads)` (passed down to `SignaturePasteDialog` via the standalone `SignatureModule` panel) loops the N committed payloads, registers every `eventId` in `appliedEventIds`, and folds each through `applyEvent` in commit order — the bulk equivalent of `awaitServer` for the signature-paste flow.
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

- Wraps the canvas subtree in `MapPresenceProvider` seeded from `data.presence` (`MapPresenceContext`) so each `SystemNode` can pull its system's online-pilot slice via `usePresenceForSystem` without prop-drilling. The provider also folds incoming `characterUpdate` envelopes onto that store.

### Depends On
- `@xyflow/react`, `./SystemNode`, `./ConnectionEdge`, `./MapPresenceContext`
- `RouteModule`, `KillStatsModule`, `InspectorModule`, `SignatureModule`
- `IntelModule`
- `applyEvent` (`@/lib/map/applyEvent`)
- `mapUpdateLoadSchema` (`@/lib/realtime/protocol`)
- `useMapSubscription`, `useRealtime` (`@/lib/realtime/useRealtime`)
- All mutation wrappers in `@/lib/map/client`

### Local State
- `selected: SelectionRef | null` — currently selected system or connection.
- `viewData: MapViewData` — mutable canvas state; updated by realtime events + optimistic patches.
- `nodes: Node<SystemNodeData>[]` — xyflow's controlled nodes state; mutated by `applyNodeChanges` (drag, measure, selection) and reconciled from `viewData.systems` via a sync effect.
- `appliedEventIds: Set<number>` (ref) — dedup set for realtime event ids and committed optimistic eventIds.
