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
| structures | Record<number, StructureIntel[]> | yes | Manual structure intel keyed by EVE system id (page-loaded seed; not realtime-synced). |
| settings | MapSettings | yes | Editable map metadata + behaviour toggles (from `loadMapSettings`), seeds the `MapSettingsDialog`. |

### Renders
An unbounded two-column layout (the page scrolls). The wide left column stacks a right-aligned toolbar row ("Add system" + "Map info" + "Settings" ghost buttons) above the `ReactFlow` canvas (pixel height, user-resizable via a drag handle), then a horizontal drag handle and then `SignatureModule` at its full natural height. The narrow right column (`w-80`, `self-start`) contains `InspectorModule`, `RouteModule`, `IntelModule`, `StructureModule`, and `KillStatsModule` and does not stretch to match the left column's height. A `MapInfoDialog` and an `AddSystemDialog` are mounted (closed by default) inside the presence provider.

### Behaviour & Interactions
- `viewData` is seeded from `data` and mutated by both realtime events and local optimistic patches; the canvas is the single source of canvas-render state.
- `appliedEventIds` ref dedupes the initiating tab's own realtime echo by `eventId`.
- `runOptimistic(optimisticPayload, run)` snapshots `viewData`, applies the payload through `applyEvent` locally, fires the network call, and either records the returned `eventId` (success) or restores the snapshot (failure). Used for PATCH / DELETE.
- `awaitServer(run)` posts and, on success, applies the server's `MapEventPayload` through `applyEvent` and records its `eventId`. Used for POST.
- `onBulkPaste(payloads)` (passed down to `SignaturePasteDialog` via the standalone `SignatureModule` panel) loops the N committed payloads, registers every `eventId` in `appliedEventIds`, and folds each through `applyEvent` in commit order — the bulk equivalent of `awaitServer` for the signature-paste flow.
- Nodes are managed in xyflow's "controlled" pattern: `nodes` is a `useState`, and `onNodesChange` applies xyflow's `NodeChange[]` through `applyNodeChanges`. This is what makes drag visually smooth — without an `onNodesChange` handler, xyflow's drag/position events have nowhere to land and nodes don't move until release. A reconcile `useEffect` syncs `viewData.systems` + `selected` + `onAliasOrTagCommit` into the nodes state, preserving each node's `dragging` position and xyflow-internal fields (`measured`, etc.) by spreading the existing entry — without that, every sync would re-measure and nodes would flicker out.
- Scroll wheel: `zoomOnScroll={false}` and `preventScrolling={false}` — the wheel does not zoom the canvas; native browser scroll propagates to the page, scrolling down to the signature panel (legacy Pathfinder behaviour).
- Viewport persistence: on mount, the stored viewport for this map (`aperture:map:<id>:viewport` in localStorage) is restored via `defaultViewport`; `fitView` is only enabled on first visit (no stored viewport). `onMoveEnd` writes the new viewport after every pan/zoom.
- Canvas height persistence: `onResizeStart` registers document-level `mousemove`/`mouseup` listeners; `mouseup` writes the final pixel height to `aperture:map:canvas-height` in localStorage. Restored via `useEffect` after mount (SSR default: 600 px). Minimum height: 200 px.
- Drag: `nodesDraggable` is on; `onNodesChange` updates the position live (so the node follows the cursor); `onNodeDragStop` PATCHes `positionX`/`positionY` optimistically through `viewData` (which the reconcile effect then folds back into the nodes state).
- Connect: `nodesConnectable` is on and `connectionMode={ConnectionMode.Loose}` so any of `SystemNode`'s four side handles can act as either source or target during drag. `onConnect` POSTs a new wormhole connection (default scope `wh`), then applies the server payload. (Rendering of the edge ignores which specific handle the user dragged from — `ConnectionEdge` snaps to whichever pair of sides face each other.) Multiple wormholes between the same two systems are fully supported: each connection gets its own row and the edge renderer fans them out perpendicular to the connection axis (see `ConnectionEdge` parallel-edge behaviour).
- Selection: `onNodeClick` / `onEdgeClick` / `onPaneClick` write a `SelectionRef = { kind: 'system' | 'connection', id } | null` into local state, which feeds `InspectorModule` and the route / kill-stats modules. The `selected` flag is reflected back into each xyflow node/edge object so rebuilding the arrays on `viewData` change (e.g. an optimistic inspector patch) does not wipe selection. (We can't rely on `onSelectionChange`: with controlled `nodes`/`edges` and no `onNodesChange`, xyflow mutates its internal `nodeLookup` directly without a zustand `set()`, so `onSelectionChange` only fires as a side effect of unrelated re-renders — which made a still click take two attempts to select.)
- Alias and tag: the system tile's `InlineTextEdit` calls back into `MapCanvas`'s `onSystemPatch` via the per-node `onAliasOrTagCommit` injected through `data`.
- Structure intel: `structures` is plain local state seeded from the page load. `onStructureCreate`/`onStructurePatch`/`onStructureDelete` await the `@/lib/structures/client` REST wrappers and fold the returned `StructureIntel` into local state on success. These are **not** map events and have no realtime echo (structures are deployment-global, not map-scoped), so there is no `applyEvent` / `appliedEventIds` involvement and another user's edits appear only on the next page load.
- Toasts: client helpers in `@/lib/map/client` surface server errors as `toast.error` before returning the failure result; `MapCanvas` only handles rollback.
- Add system (manual): the toolbar "Add system" button opens `AddSystemDialog`. Selecting a search result fires `onAddSystem(systemId)`, which POSTs via `addSystemOnServer` and applies the server payload through `awaitServer` (same path as `onConnect`). New nodes are placed at the current viewport centre (computed from the `ReactFlowInstance` captured in `onInit` + the canvas wrapper's bounding rect) with ±40px jitter so successive adds don't stack; it falls back to (0,0) before the instance is ready. This is the "add a system without jumping a wormhole" pathway — no connection is created.
- Map info: the toolbar "Map info" button toggles `mapInfoOpen`, opening `MapInfoDialog` with the live `viewData`. The dialog reads counts/systems/connections straight from `viewData` and the online roster from the presence store — no fetch. Lives inside `MapPresenceProvider` so `usePresenceForMap` resolves.
- Settings: the toolbar "Settings" button toggles `settingsOpen`, opening `MapSettingsDialog` seeded with the `settings` prop. Its import flow returns committed event payloads which are folded onto the canvas via the same `onBulkPaste` handler used by signature paste (registers each `eventId`, applies via `applyEvent`).

### Emits / Calls
- `onNodesChange` — xyflow callback; applies `NodeChange[]` to the nodes state via `applyNodeChanges`.
- `useMapSubscription` / `useRealtime` — subscribe + consume live events.
- `applyEvent` — pure reducer applied for every event and every optimistic patch.
- `@/lib/map/client` — all eight mutation wrappers + `fetchWormholeTypes` (via the inspector).

- Wraps the canvas subtree in `MapPresenceProvider` seeded from `data.presence` (`MapPresenceContext`) so each `SystemNode` can pull its system's online-pilot slice via `usePresenceForSystem` without prop-drilling. The provider also folds incoming `characterUpdate` envelopes onto that store.
- Threads `viewData.connections` and `viewData.systems` into `SignatureModule` so its `ConnectionSelect` can list connections incident to the active system without an API call.

### Depends On
- `@xyflow/react`, `./SystemNode`, `./ConnectionEdge`, `./MapPresenceContext`
- `@/components/dialogs/MapInfoDialog`, `@/components/dialogs/MapSettingsDialog`, `./AddSystemDialog`, `@/components/ui/button`
- `RouteModule`, `KillStatsModule`, `InspectorModule`, `SignatureModule`
- `IntelModule`, `StructureModule`
- Structure REST wrappers in `@/lib/structures/client`
- `applyEvent` (`@/lib/map/applyEvent`)
- `mapUpdateLoadSchema` (`@/lib/realtime/protocol`)
- `useMapSubscription`, `useRealtime` (`@/lib/realtime/useRealtime`)
- All mutation wrappers in `@/lib/map/client`

### Local State
- `selected: SelectionRef | null` — currently selected system or connection.
- `mapInfoOpen: boolean` — whether the `MapInfoDialog` is open.
- `settingsOpen: boolean` — whether the `MapSettingsDialog` is open.
- `addSystemOpen: boolean` — whether the `AddSystemDialog` is open.
- `flowInstance: ReactFlowInstance | null` (ref) — captured in `onInit`; used to map screen → flow coords for manual system placement.
- `flowWrapperRef: HTMLDivElement | null` (ref) — the canvas wrapper, for its bounding rect (viewport centre).
- `viewData: MapViewData` — mutable canvas state; updated by realtime events + optimistic patches.
- `nodes: Node<SystemNodeData>[]` — xyflow's controlled nodes state; mutated by `applyNodeChanges` (drag, measure, selection) and reconciled from `viewData.systems` via a sync effect.
- `appliedEventIds: Set<number>` (ref) — dedup set for realtime event ids and committed optimistic eventIds.
- `initialViewport: Viewport | null` — lazy-init from `localStorage`; null triggers `fitView`, non-null restores the saved pan/zoom position.
- `canvasHeight: number` — pixel height of the map canvas; initialized to 600 (SSR-safe), then set from `aperture:map:canvas-height` in localStorage on mount.
- `structures: Record<number, StructureIntel[]>` — manual structure intel keyed by EVE system id; seeded from the `structures` prop and updated on the user's own structure CRUD (no realtime).
