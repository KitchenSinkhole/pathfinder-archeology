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
| travelAnimation | boolean | yes | The viewer's per-account connection-travel-animation toggle. When true, mounts the `TravelBridge` that plays the moving-dot effect on pilot jumps. |
| canConfigureTagging | boolean | yes | Owner/admin gate (Stage 17.10): passed to `MapSettingsDialog` to show the Tagging tab. |
| viewerCharacterIds | number[] | yes | The viewer's account character ids; passed to `SignaturePasteHotkey` for the CTRL+V fast-paste location check. |

### Renders
An unbounded two-column layout (the page scrolls). The wide left column stacks a right-aligned toolbar row ("Add system" + "Map info" + "Settings" ghost buttons) above the `ReactFlow` canvas (pixel height, user-resizable via a drag handle), then a horizontal drag handle and then `SignatureModule` at its full natural height. The narrow right column (`w-80`, `self-start`) contains `InspectorModule`, `RouteModule`, `IntelModule`, `StructureModule`, `KillStatsModule`, `SystemGraphModule`, `SystemKillboardModule`, and `TagsModule` (Stage 17.10 — auto-tag "next available", hidden when the map runs no scheme) and does not stretch to match the left column's height. A `MapInfoDialog` and an `AddSystemDialog` are mounted (closed by default) inside the presence provider.

### Behaviour & Interactions
- `viewData` is seeded from `data` and mutated by both realtime events and local optimistic patches; the canvas is the single source of canvas-render state.
- `appliedEventIds` ref dedupes the initiating tab's own realtime echo by `eventId`.
- `runOptimistic(optimisticPayload, run)` snapshots `viewData`, applies the payload through `applyEvent` locally, fires the network call, and either records the returned `eventId` (success) or restores the snapshot (failure). Used for PATCH / DELETE.
- `awaitServer(run)` posts and, on success, applies the server's `MapEventPayload` through `applyEvent` and records its `eventId`. Used for POST.
- `onBulkPaste(payloads)` (passed down to `SignaturePasteDialog` via the standalone `SignatureModule` panel) loops the N committed payloads, registers every `eventId` in `appliedEventIds`, and folds each through `applyEvent` in commit order — the bulk equivalent of `awaitServer` for the signature-paste flow.
- Nodes are managed in xyflow's "controlled" pattern: `nodes` is a `useState`, and `onNodesChange` applies xyflow's `NodeChange[]` through `applyNodeChanges`. This is what makes drag visually smooth — without an `onNodesChange` handler, xyflow's drag/position events have nowhere to land and nodes don't move until release. A render-time sync block (keyed on `{ systems, selectedSystemIds }`, both compared by reference — every selection mutation makes a fresh `Set`) syncs `viewData.systems` + per-node `selected: selectedSystemIds.has(s.id)` + `onAliasOrTagCommit` into the nodes state, preserving each node's `dragging` position and xyflow-internal fields (`measured`, etc.) by spreading the existing entry — without that, every sync would re-measure and nodes would flicker out.
- Scroll wheel: `zoomOnScroll={false}` and `preventScrolling={false}` — the wheel does not zoom the canvas; native browser scroll propagates to the page, scrolling down to the signature panel (legacy Pathfinder behaviour).
- Viewport persistence: on mount, the stored viewport for this map (`aperture:map:<id>:viewport` in localStorage) is restored via `defaultViewport`; `fitView` is only enabled on first visit (no stored viewport). `onMoveEnd` writes the new viewport after every pan/zoom.
- Canvas height persistence: `onResizeStart` registers document-level `mousemove`/`mouseup` listeners; `mouseup` writes the final pixel height to `aperture:map:canvas-height` in localStorage. Restored via `useEffect` after mount (SSR default: 600 px). Minimum height: 200 px.
- Drag: `nodesDraggable` is on; `onNodesChange` updates the position live (so the node follows the cursor). Live dragging snaps to the grid (`snapToGrid` + `snapGrid={[GRID_SIZE, GRID_SIZE]}` from `@/lib/map/placement`). `onNodeDragStop` snaps the drop point, and if it `overlaps` any *other* node, replaces it with `findOpenPosition(snappedDrop, occupiedOthers)` (search starts at the drop so the nudge is minimal); the final snapped/nudged coords PATCH `positionX`/`positionY` optimistically through `viewData` (which the reconcile effect then folds back into the nodes state, settling the node into the nudged slot). No write if the snapped/nudged position equals the current one. When the grabbed node is part of a multi-selection (`selectedSystemIds.size > 1 && has(node.id)`), `onNodeDragStop` instead delegates to `commitGroupMove()` and returns.
- Group drag (multi-select, N>1): dragging any selected node moves the whole group (xyflow shifts every selected node by the same delta, writing their live positions into `nodes` via `onNodesChange`). `commitGroupMove` reads those final positions back from xyflow's store (`flowInstance.getNodes()` — authoritative and synchronous at dragStop, unlike the React `nodes` state which can lag a frame), snaps each, and PATCHes it via the same optimistic `runOptimistic` + `updateSystemOnServer` loop as the single-node path; the collision nudge runs **only against non-selected systems** so an intra-group overlap never deforms the group. Unchanged snapped positions are skipped. (There is no `onSelectionDragStop` — xyflow's persistent multi-select bounding box is suppressed in CSS, see below, so group drag always flows through `onNodeDragStop`.)
- Connect: `nodesConnectable` is on and `connectionMode={ConnectionMode.Loose}` so any of `SystemNode`'s four side handles can act as either source or target during drag. `onConnect` POSTs a new wormhole connection (default scope `wh`), then applies the server payload. (Rendering of the edge ignores which specific handle the user dragged from — `ConnectionEdge` snaps to whichever pair of sides face each other.) Multiple wormholes between the same two systems are fully supported: each connection gets its own row and the edge renderer fans them out perpendicular to the connection axis (see `ConnectionEdge` parallel-edge behaviour).
- Selection: two cooperating pieces of state — `selected: SelectionRef = { kind: 'system' | 'connection', id } | null` is the **primary anchor** that feeds `InspectorModule` and every sidebar module (route / intel / structure / stats / graph / killboard / tags), and `selectedSystemIds: Set<string>` is the multi-select group. Invariant: when `selected?.kind === 'system'` the set contains `selected.id`. **The primary is cleared (`selected = null`) whenever 2+ systems are selected** — a multi-select group drives no inspector / per-system module, which avoids thrashing the self-fetching Graph / Killboard modules as a box drag sweeps nodes; a lone survivor re-populates it. Selecting a connection or clicking the pane clears the set; `size <= 1` is the legacy single-select regime (behaviour identical to before). Handlers:
  - `onNodeClick` — plain click replaces the set with `{node.id}` and sets it primary; **Ctrl/Cmd+click** toggles the node in a fresh set, then sets primary to the lone member when `size === 1`, else null.
  - `onEdgeClick` sets the connection primary and clears the set; `onPaneClick` clears both.
  - `onSelectionChange` is a **box-select-only reconciler**, gated by a `boxSelecting` ref that is true only between `onSelectionStart` and `onSelectionEnd` (the drag-box bracket). xyflow fires `onSelectionChange` for *every* selection mutation, including the echoes of our own click handlers — adopting those would fight the click handlers and loop (Max update depth). So it adopts xyflow's reported node set only while a box drag is active, `size > 1`, and the set differs from `selectedSystemIds` (the diff check skips a no-op rebuild). On adopt it clears the primary (same multi-select rule above).
  - ReactFlow props enabling the above: `selectionKeyCode`/`multiSelectionKeyCode` `= ['Control', 'Meta']` (Ctrl/Cmd+drag draws a selection box and Ctrl/Cmd+click multi-selects; plain drag still pans), `selectionMode={SelectionMode.Partial}` (touched, not only enclosed), `deleteKeyCode={null}` (xyflow's built-in delete is disabled so it never competes with our keydown handler or deletes edges).
  - The `selected` flag is reflected back into each xyflow node (`selected: selectedSystemIds.has(s.id)`) / edge (from the primary ref) so rebuilding the arrays on a `viewData` change (e.g. an optimistic patch or realtime rebuild) does not wipe selection.
  - A box drag ends up **identical to Ctrl+click**: the same controlled `selected` flags highlight the nodes, and xyflow's persistent bounding box (`.react-flow__nodesselection`) is hidden via a global CSS rule (`src/app/globals.css`) so there is no tight-box overlay and group drag flows through `onNodeDragStop`. The live drag rectangle (`.react-flow__selection`) is a different element and stays visible during the drag.
- Group delete: a `removeSelectedSystems` callback loops the existing single-item `removeSystemOnServer` over `selectedSystemIds` (each via `runOptimistic`), then clears selection — the `onBulkPaste` precedent, no batch endpoint. Triggered by **both** a `document` `keydown` listener on `Delete`/`Backspace` (gated to do nothing when the event target is an `INPUT`/`TEXTAREA`/`isContentEditable`, so typing in inspector/signature fields is safe) **and** a floating destructive "Remove N" button (`Trash2` icon, `nodrag nopan`, top-right of the canvas, `z-10`) rendered only when `selectedSystemIds.size > 1`.
- Alias and tag: the system tile's `InlineTextEdit` calls back into `MapCanvas`'s `onSystemPatch` via the per-node `onAliasOrTagCommit` injected through `data`.
- Structure intel: `structures` is plain local state seeded from the page load. `onStructureCreate`/`onStructurePatch`/`onStructureDelete` await the `@/lib/structures/client` REST wrappers and fold the returned `StructureIntel` into local state on success. These are **not** map events and have no realtime echo (structures are deployment-global, not map-scoped), so there is no `applyEvent` / `appliedEventIds` involvement and another user's edits appear only on the next page load.
- Toasts: client helpers in `@/lib/map/client` surface server errors as `toast.error` before returning the failure result; `MapCanvas` only handles rollback.
- Add system (manual): the toolbar "Add system" button opens `AddSystemDialog`. Selecting a search result fires `onAddSystem(systemId)`, which POSTs via `addSystemOnServer` and applies the server payload through `awaitServer` (same path as `onConnect`). Placement anchors on the selected system's position when `selected.kind === 'system'`, else the current viewport centre (from the `ReactFlowInstance` captured in `onInit` + the canvas wrapper's bounding rect, falling back to (0,0) before the instance is ready), then `findOpenPosition(anchor, occupied)` (`@/lib/map/placement`, `occupied` derived from `viewData.systems`) settles it into the nearest open, grid-aligned slot so adds never overlap existing nodes. This is the "add a system without jumping a wormhole" pathway — no connection is created.
- Map info: the toolbar "Map info" button toggles `mapInfoOpen`, opening `MapInfoDialog` with the live `viewData`. The dialog reads counts/systems/connections straight from `viewData` and the online roster from the presence store — no fetch. Lives inside `MapPresenceProvider` so `usePresenceForMap` resolves.
- Settings: the toolbar "Settings" button toggles `settingsOpen`, opening `MapSettingsDialog` seeded with the `settings` prop. Its import flow returns committed event payloads which are folded onto the canvas via the same `onBulkPaste` handler used by signature paste (registers each `eventId`, applies via `applyEvent`).

### Emits / Calls
- `onNodesChange` — xyflow callback; applies `NodeChange[]` to the nodes state via `applyNodeChanges`.
- `useMapSubscription` / `useRealtime` — subscribe + consume live events.
- `applyEvent` — pure reducer applied for every event and every optimistic patch.
- `@/lib/map/client` — all eight mutation wrappers + `fetchWormholeTypes` (via the inspector).

- Wraps the canvas subtree in `MapPresenceProvider` seeded from `data.presence` (`MapPresenceContext`) so each `SystemNode` can pull its system's online-pilot slice via `usePresenceForSystem` without prop-drilling. The provider also folds incoming `characterUpdate` envelopes onto that store.
- Inside that, wraps the subtree in `MapTravelProvider` (`MapTravelContext`) so `ConnectionEdge` can read its own travel pulse. When `travelAnimation` is true, mounts `TravelBridge` (passing `viewData.systems` + `viewData.connections`) which listens to presence traversals and pulses the matching edge; when false the bridge is absent so no animation ever plays.
- Inside that, wraps the subtree in `MapUnderglowProvider` (`MapUnderglowContext`) so each `SystemNode` can read its own underglow slice, and always mounts `MapUnderglowBridge` (passing `viewData.systems`) which turns incoming `systemNotification` realtime events (Stage 17.8 zKB kills) into a per-node glow pulse.
- Mounts `SignaturePasteHotkey` (inside `MapPresenceProvider`, so it can read live presence) — the CTRL+V fast-paste listener. On a scanner-data paste it applies add+update sigs straight to `selectedSystem` via `onBulkPaste`, gating behind a mismatch confirm when none of `viewerCharacterIds` are located in the selected system.
- Threads `viewData.connections` and `viewData.systems` into `SignatureModule` so its `ConnectionSelect` can list connections incident to the active system without an API call.

### Depends On
- `@xyflow/react`, `./SystemNode`, `./ConnectionEdge`, `./MapPresenceContext`, `./MapTravelContext`, `./MapUnderglowContext`, `./MapUnderglowBridge`, `./SignaturePasteHotkey`
- `@/components/dialogs/MapInfoDialog`, `@/components/dialogs/MapSettingsDialog`, `./AddSystemDialog`, `@/components/ui/button`
- `RouteModule`, `KillStatsModule`, `InspectorModule`, `SignatureModule`
- `IntelModule`, `StructureModule`, `SystemGraphModule`, `SystemKillboardModule` (both self-fetch per-selected-system from `/api/system/[id]/…`)
- `TagsModule`, `TheraModule` (global, always-on; `TheraModule` self-fetches `/api/map/[id]/thera` and folds synced edges via `onBulkPaste`)
- Structure REST wrappers in `@/lib/structures/client`
- `applyEvent` (`@/lib/map/applyEvent`)
- `@/lib/map/placement` — `GRID_SIZE`, `findOpenPosition`, `overlaps`, `snapToGrid` (aliased `snapPointToGrid` to avoid clashing with the ReactFlow `snapToGrid` prop) for manual-add anchoring, drag nudge, and live grid snap.
- `mapUpdateLoadSchema` (`@/lib/realtime/protocol`)
- `useMapSubscription`, `useRealtime` (`@/lib/realtime/useRealtime`)
- All mutation wrappers in `@/lib/map/client`

### Local State
- `selected: SelectionRef | null` — primary (anchor) selection; drives the inspector and all sidebar modules.
- `selectedSystemIds: Set<string>` — the multi-select group (always replaced, never mutated). `size <= 1` is the legacy single-select regime. Drives each node's `selected` flag and the floating "Remove N" button.
- `mapInfoOpen: boolean` — whether the `MapInfoDialog` is open.
- `settingsOpen: boolean` — whether the `MapSettingsDialog` is open.
- `addSystemOpen: boolean` — whether the `AddSystemDialog` is open.
- `flowInstance: ReactFlowInstance | null` (ref) — captured in `onInit`; used to map screen → flow coords for manual system placement.
- `flowWrapperRef: HTMLDivElement | null` (ref) — the canvas wrapper, for its bounding rect (viewport centre).
- `boxSelecting: boolean` (ref) — true only during a drag-box selection (set by `onSelectionStart`/`onSelectionEnd`); gates `onSelectionChange` so it adopts box selections but ignores click-driven echoes.
- `viewData: MapViewData` — mutable canvas state; updated by realtime events + optimistic patches.
- `nodes: Node<SystemNodeData>[]` — xyflow's controlled nodes state; mutated by `applyNodeChanges` (drag, measure, selection) and reconciled from `viewData.systems` via a sync effect.
- `appliedEventIds: Set<number>` (ref) — dedup set for realtime event ids and committed optimistic eventIds.
- `initialViewport: Viewport | null` — lazy-init from `localStorage`; null triggers `fitView`, non-null restores the saved pan/zoom position.
- `canvasHeight: number` — pixel height of the map canvas; initialized to 600 (SSR-safe), then set from `aperture:map:canvas-height` in localStorage on mount.
- `structures: Record<number, StructureIntel[]>` — manual structure intel keyed by EVE system id; seeded from the `structures` prop and updated on the user's own structure CRUD (no realtime).
