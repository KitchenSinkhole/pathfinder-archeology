## ConnectionEdge

**Purpose:** Read-only xyflow custom edge rendering a map connection with scope/mass colouring, EOL dashing, and state badges.
**File:** `src/components/map/ConnectionEdge.tsx`

### Props
xyflow `EdgeProps` with `data: ConnectionEdgeData` (= `MapConnectionEdge`).

### Renders
A bezier `BaseEdge` styled via `connectionStyle` (scope→colour, wormhole recoloured by mass, EOL dashed, frigate thinned) plus a midpoint label of badges (`connectionBadges`: jump-mass, EOL, FRIG, ROLL, PRES) when any apply.

### Behaviour & Interactions
- Read-only: no detach/select handles. Label is `pointer-events-none`.

### Depends On
- `@xyflow/react` (`BaseEdge`, `EdgeLabelRenderer`, `getBezierPath`, `EdgeProps`), `./styling`.
