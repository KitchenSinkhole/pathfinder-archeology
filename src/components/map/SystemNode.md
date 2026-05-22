## SystemNode

**Purpose:** Read-only xyflow custom node rendering a single map system tile (status stripe, security badge, tag, alias/name, lock, statics/effect line).
**File:** `src/components/map/SystemNode.tsx`

### Props
Receives xyflow `NodeProps` with `data: SystemNodeData` (= `MapSystemNode`) and `selected`.

### Renders
A card with a left status stripe (colour from `systemStatusColor`), a head row (security label, optional tag chip, alias-or-name, lock icon), and — for wormhole systems or systems with an effect — a secondary line listing the effect and static codes. Region/constellation shown as the hover title.

### Behaviour & Interactions
- Read-only: hidden, non-connectable source/target `Handle`s exist only as edge anchors.
- Selection is reflected by an outline; selection state is owned by `MapCanvas`.
- Wormhole detection: has statics, or name matches `J######`.

### Depends On
- `@xyflow/react` (`Handle`, `Position`, `NodeProps`), `./styling` (`systemStatusColor`), `lucide-react` (`Lock`).
