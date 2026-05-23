## SystemNode

**Purpose:** xyflow custom node rendering a single map system tile (status stripe, security badge, tag, alias/name, lock, statics/effect line) with inline edit affordances for alias and tag.
**File:** `src/components/map/SystemNode.tsx`

### Props
Receives xyflow `NodeProps` with `data: SystemNodeData` and `selected`.

`SystemNodeData` extends `MapSystemNode` with an optional `onAliasOrTagCommit(mapSystemId, field, next)` callback wired by `MapCanvas`. When the callback is present, the alias and tag chips render via `InlineTextEdit` (double-click to edit, Enter commits, Esc cancels, blur cancels, empty commits as null). When absent the chips fall back to plain spans (legacy read-only path).

### Renders
A card with a left status stripe (colour from `systemStatusColor`), a head row (security label, tag chip, alias-or-name, lock icon), and — for wormhole systems or systems with an effect — a secondary line listing the effect and static codes. Region/constellation shown as the hover title.

### Behaviour & Interactions
- Drag handles on all four sides (top / right / bottom / left) are visible at low opacity to invite connections; xyflow `nodesConnectable` / `nodesDraggable` are controlled by `MapCanvas`. All four are declared as `type="source"` and the canvas runs in `ConnectionMode.Loose` so any side can act as either end of a new connection. `ConnectionEdge` picks which two sides to render against at draw time based on relative node centres, so the stored handle pair is incidental.
- Selection is reflected by an outline; selection state is owned by `MapCanvas`. The card uses `cursor-pointer` so the entire tile reads as clickable — any click bubbles through xyflow's node wrapper to fire selection.
- Wormhole detection: has statics, or name matches `J######`.
- Inline editors carry `nodrag nopan` (set inside `InlineTextEdit`) so editing doesn't trigger pan / drag.
- All other field edits (status, intel notes, locked, rally, signatures, remove) live in `InspectorModule`.

### Depends On
- `@xyflow/react` (`Handle`, `Position`, `NodeProps`), `./styling` (`systemStatusColor`), `./InlineTextEdit`, `lucide-react` (`Lock`).
