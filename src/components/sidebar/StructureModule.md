## StructureModule

**Purpose:** Sidebar module listing manual structure intel for the selected system, with add/edit/delete.
**File:** `src/components/sidebar/StructureModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode \| null | yes | Selected system; null shows the empty state |
| structures | StructureIntel[] | yes | Structures for the selected system (sliced by the parent) |
| onCreate | (values: StructureFormValues) => void | yes | Add a structure (parent supplies the systemId) |
| onPatch | (structureId: string, values: StructureFormValues) => void | yes | Edit a structure |
| onDelete | (structureId: string) => void | yes | Delete a structure |

### Renders
A `Card` titled "Structures" with an "Add" button (when a system is selected) and a list of structure rows (name, type, owner, notes, "added by"), each with edit/delete icon buttons.

### Behaviour & Interactions
- Empty states: "Select a system…" (no system) / "No structures recorded." (none).
- "Add" / edit open the shared `StructureFormDialog` (edit passes `initial`).
- **Not realtime-synced** — another user's structure edits appear on the next page load (structures are deployment-global, not map-scoped).

### Depends On
- `StructureFormDialog` — create/edit form.

### Local State
- `dialogOpen: boolean`, `editing: StructureIntel | null` (null ⇒ add mode).
