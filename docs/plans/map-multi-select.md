# Map Multi-Select

**Goal:** Let users select multiple system nodes (Ctrl+click and Ctrl+drag box) and then delete or drag the whole group in unison.
**Spec references:** `docs/spec/` map-canvas behaviour; companion-file rule in `CLAUDE.md`.

## Context

The map canvas (`src/components/map/MapCanvas.tsx`, xyflow/react-flow v12) currently supports **single** selection only: React state `selected: SelectionRef | null` (`{ kind: 'system' | 'connection', id }`), driven by manual `onNodeClick`/`onEdgeClick`/`onPaneClick` handlers and re-imposed onto the controlled `nodes` array in a render-time sync block so it survives realtime/optimistic `viewData` rebuilds. Drag commits one node (`onNodeDragStop`); deletion is only via the inspector "Remove from map" button (one system).

Users want to rearrange and prune maps faster: select a group of systems at once, then drag them together or delete them together. This adds group selection, group drag, and group delete while leaving every existing single-select behavior (inspector, route/stats/structure modules, single drag/nudge, connection selection) untouched.

**Confirmed UX decisions:**
- Group delete is triggered by **both** the Delete/Backspace key (gated against text inputs) **and** a floating "Remove N" button shown over the canvas when 2+ systems are selected.
- The sidebar inspector keeps showing the **primary (last-clicked anchor) system** during multi-select — no group-edit panel.

The whole change is contained to one source file plus its companion `.md`, so it fits in a single stage.

## Stage 1 — Multi-select selection, drag, and delete

**Mode:** Accept edits
**Goal:** Add group select (Ctrl+click + Ctrl+drag box), group drag in unison, and group delete (key + floating button) to the map canvas.
**Touches:** `src/components/map/MapCanvas.tsx`, `src/components/map/MapCanvas.md`. Read-only reuse of `src/lib/map/placement.ts` (`snapToGrid`, `overlaps`, `findOpenPosition`, `GRID_SIZE`) and `src/lib/map/client.ts` (`updateSystemOnServer`, `removeSystemOnServer`).

### Selection model
Keep `selected: SelectionRef | null` as the **primary** selection (drives `InspectorModule`, route/stats/structure/graph/killboard modules — all unchanged). Add one new state:

```ts
const [selectedSystemIds, setSelectedSystemIds] = useState<Set<string>>(() => new Set());
```

**Invariants** (every handler must hold them; always create a **new** `Set`, never mutate — the sync block relies on reference equality):
- When `selected?.kind === 'system'`, `selectedSystemIds` contains `selected.id` (the anchor).
- Selecting a connection or clicking the empty pane clears `selectedSystemIds`.
- `size <= 1` is the legacy single-select regime — behavior must be identical to today.

### 1. Click handlers
- `onNodeClick(event, node)` — branch on `event.ctrlKey || event.metaKey`:
  - **additive:** toggle `node.id` in a new `Set`; set primary `selected` to the just-added node, or to a remaining member, or `null` if the set emptied.
  - **plain:** `setSelected({ kind: 'system', id: node.id })` and `setSelectedSystemIds(new Set([node.id]))` (replace).
- `onEdgeClick` — also `setSelectedSystemIds(new Set())`.
- `onPaneClick` — also `setSelectedSystemIds(new Set())`.
- `onSystemRemove` (inspector path) — also `setSelectedSystemIds(new Set())` for consistency.

### 2. Box select (Ctrl+drag on empty pane)
Add ReactFlow props (import `SelectionMode` from `@xyflow/react`):
- `selectionKeyCode={['Control', 'Meta']}` — Ctrl+drag draws a box instead of panning (plain drag still pans).
- `multiSelectionKeyCode={['Control', 'Meta']}`
- `selectionMode={SelectionMode.Partial}` — select touched, not only enclosed.
- `deleteKeyCode={null}` — explicitly disable xyflow's built-in delete so it never competes with our handler or deletes edges.

Add `onSelectionChange={onSelectionChange}` as the **box-select-only reconciler** to avoid fighting the manual click handlers: adopt xyflow's reported node set **only when `size > 1` and it differs** from current `selectedSystemIds` (single/empty transitions stay owned by the click/pane handlers). On adopt, set primary to the first reported node. `onNodesChange`/`applyNodeChanges` are already wired, so `onSelectionChange` now fires reliably (the old "two-attempts" caveat predates that wiring).

### 3. Group drag in unison
- Add `onSelectionDragStop={onSelectionDragStop}` for N>1. xyflow already moves all selected nodes by the same delta (relative layout preserved); we snap each to grid and PATCH each via looped `runOptimistic` + `updateSystemOnServer` (reuse the per-node logic from `onNodeDragStop`). Collision-nudge (`findOpenPosition`/`overlaps`) **only against non-selected systems** — never intra-group, so formation is preserved. Skip the write when a node's snapped position is unchanged.
- `onNodeDragStop` — early-return when `selectedSystemIds.size > 1 && selectedSystemIds.has(node.id)` (that drag is handled by `onSelectionDragStop`); otherwise unchanged. Add `selectedSystemIds` to deps.

### 4. Group delete (key + button)
- `useEffect` registering a `document` `keydown` listener: on `Delete`/`Backspace`, ignore when the event target is an `INPUT`/`TEXTAREA`/`isContentEditable` (so typing in inspector/signature fields is safe); else loop `runOptimistic({ kind: 'system.removed', ... })` + `removeSystemOnServer` over `selectedSystemIds`, then clear `selected` + `selectedSystemIds`. Deps: `[mapId, runOptimistic, selectedSystemIds]`.
- **Floating "Remove N" button:** add `relative` to the flow wrapper `div` (around the `ReactFlow`), and render an absolutely-positioned button (top-right, high z-index, `nodrag nopan` class) only when `selectedSystemIds.size > 1`. It shows the count + a trash icon (`lucide-react` `Trash2`) and calls the same delete loop. Both paths share one `removeSelectedSystems` callback.

### 5. Sync block (render-time, around the `lastSync` block)
- Re-key `lastSync` from `{ systems, selected }` to `{ systems, selectedSystemIds }`; compare `lastSync.selectedSystemIds !== selectedSystemIds` (valid because every mutation makes a new `Set`).
- Per-node: change `selected: selected?.kind === 'system' && selected.id === s.id` → `selected: selectedSystemIds.has(s.id)`.
- The `edges` memo is **unchanged** (connections still derive `selected` from the primary ref). `selectedSystem` memo unchanged.

### Not changed
`runOptimistic`, `awaitServer`, `client.ts`, `placement.ts`, `SystemNode.tsx`, `InspectorModule.tsx`, edges memo, all sidebar modules. **No new API endpoint** — looping the existing single-item endpoints follows the established `onBulkPaste` precedent and respects the "no abstractions beyond what's required" rule (groups are small, hand-selected).

### Companion `.md` update (required by the standing instruction)
Update `MapCanvas.md`: Local State (add `selectedSystemIds`); the Selection bullet (single vs Ctrl+click-toggle vs Ctrl+drag box, the `onSelectionChange` size>1 reconciler, new ReactFlow props); the Drag bullet (group drag via `onSelectionDragStop` + the single-node guard, non-selected-only nudge); a new Group-delete bullet (keydown + input gate + floating "Remove N" button, both via one delete loop); and the sync-block description (node `selected` now derived from `selectedSystemIds`).

**Done when:**
- `npm run build` / lint pass.
- Manual checks below all hold.

### Verification (manual, run the app)
1. **Single-select unchanged:** plain click selects one (inspector + modules populate); click another replaces; pane click clears; connection click shows connection inspector and drops any system group.
2. **Ctrl+click toggle:** Ctrl+click A then B → both outlined, inspector shows B; Ctrl+click B again → only A, inspector falls back to A; Ctrl+click last → empty.
3. **Box select:** hold Ctrl, drag a rectangle over 3 nodes → box draws (no pan), all 3 outlined; plain drag still pans. Watch for any one-frame flicker (fallback: OR-merge in-store selection during box-drag).
4. **Group drag:** select 3, drag one → all move together, snap on drop, positions persist after reload; single non-grouped node still drags + nudges as before.
5. **Group delete:** select 3 → press Delete and (separately) click the floating "Remove 3" button → all removed, selection clears; Delete/Backspace while focused in an inspector/signature input does nothing; single-node inspector delete still works.
6. **Realtime rebuild preserves multi-selection:** with 3 selected, trigger a `viewData` change (another tab patches a different system, or paste signatures) → the 3 outlines survive the rebuild.

### xyflow gotchas to watch (v12.10.2)
- `onNodeDragStop` may also fire per-node during a selection drag — the `size>1` guard neutralizes it; confirm.
- `selectNodesOnDrag` (default true): if starting a group drag on a member collapses the selection, set `selectNodesOnDrag={false}` (contingency).
- Confirm `deleteKeyCode={null}` is accepted as "disabled" in this version (it is in v12).
