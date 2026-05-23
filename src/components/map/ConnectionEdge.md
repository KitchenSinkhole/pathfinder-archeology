## ConnectionEdge

**Purpose:** xyflow custom edge rendering a map connection with scope/mass colouring, EOL dashing, state badges, and a selected-state highlight.
**File:** `src/components/map/ConnectionEdge.tsx`

### Props
xyflow `EdgeProps` with `data: ConnectionEdgeData` (= `MapConnectionEdge`) and `selected`.

### Renders
A bezier `BaseEdge` styled via `connectionStyle` (scope→colour, wormhole recoloured by mass, EOL dashed, frigate thinned) plus a midpoint label of badges (`connectionBadges`: jump-mass, EOL, FRIG, ROLL, PRES) when any apply.

### Behaviour & Interactions
- Selectable by click — `MapCanvas` consumes `onSelectionChange` and routes the selected edge into the sidebar inspector.
- When `selected`, the stroke thickens by 1.5 px and a `drop-shadow` glow is applied in the current stroke colour to surface which edge the inspector is editing.
- Label is `pointer-events-none` so clicks always hit the path, not the badge stack.
- Edits all live in the sidebar inspector (`InspectorModule.ConnectionInspector`).

### Depends On
- `@xyflow/react` (`BaseEdge`, `EdgeLabelRenderer`, `getBezierPath`, `EdgeProps`), `./styling`.
