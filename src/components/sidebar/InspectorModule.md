## InspectorModule

**Purpose:** Selection-driven sidebar panel that hosts all editable fields for the currently selected system or connection.
**File:** `src/components/sidebar/InspectorModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| selected | SelectionRef \| null | yes | `{ kind: 'system' \| 'connection', id }` or `null`. |
| viewData | MapViewData | yes | Source of the system / connection being edited. |
| onSystemPatch | (mapSystemId, patch: UpdateSystemBody) => void | yes | Issue a PATCH on the system. |
| onSystemRemove | (mapSystemId) => void | yes | DELETE the system (visible=false). |
| onConnectionPatch | (connectionId, patch: UpdateConnectionBody) => void | yes | PATCH the connection. |
| onConnectionDelete | (connectionId) => void | yes | DELETE the connection (hard). |

### Renders
One of three sub-views:
- **`SystemInspector`** — status select, alias / tag inputs (per-keystroke commit), intel notes textarea (committed on blur), locked checkbox, rally set / clear buttons, "Remove from map" button. Signatures are now a separate full-width panel below the map (see `SignatureModule`).
- **`ConnectionInspector`** — scope / mass / jump-mass selects, EOL / Frigate / Preserve / Rolling checkboxes, a live "Expires in X" / "EOL expires in X" hint (`ConnectionExpiryHint`, derived from `connectionTimeLeftMs` + `formatRelativeFromMs`, hidden for non-wormhole scopes), "Delete connection" button.
- **`EmptyInspector`** — placeholder card prompting the user to select something.

### Behaviour & Interactions
- All edits go through the supplied callbacks; the inspector itself holds no view state beyond the intel-notes draft and the rally toggle UI.
- `intelNotes` is intentionally write-only here: the field is not in `MapViewData` (so we keep a local draft) and commits on blur to avoid a PATCH per keystroke.
- Selecting a different system clears the intel draft.
- A jump-mass value of `__none__` maps to `null` on the wire.

### Depends On
- `Select*`, `Card*`, `Button`, `Input` shadcn primitives
- `connectionTimeLeftMs` (`@/lib/map/connectionState`) + `formatRelativeFromMs` (`@/lib/map/relativeTime`) for the expiry hint
- Enum value lists from `@/lib/map/enumLabels`
- `MapViewData`, `MapSystemNode`, `MapConnectionEdge` from `@/types`
- Body types from `@/lib/map/client`
