## StructureFormDialog

**Purpose:** Create/edit dialog for a manual structure (name, type, owner, notes).
**File:** `src/components/sidebar/StructureFormDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state |
| onOpenChange | (open: boolean) => void | yes | Open-state setter |
| systemName | string | yes | Shown in the dialog description |
| initial | StructureIntel | no | Present ⇒ edit mode (prefills + "Save" label) |
| onSubmit | (values: StructureFormValues) => void | yes | Called with validated values; dialog then closes |

### Renders
A modal `Dialog` form: name `Input` (required), type `Select` (Upwell types, required), owner picker (`OwnerCorpField`), notes `<textarea>`.

### Behaviour & Interactions
- Field state lives in an inner `StructureForm` rendered inside the dialog popup. Base UI unmounts the popup on close, so `StructureForm` remounts on each open and its `useState` initializers reset the fields from `initial` (or empty) — no syncing effect. Keyed on `initial?.id ?? 'new'` to also reset on an in-place edit→edit identity change.
- The outer dialog keeps the type catalog (`types`) so the cache survives across opens; it lazy-loads via `fetchStructureTypes()` (cached) on first open. Types are sorted by group then name inside `StructureForm`.
- Validates name non-empty and a type selected (toasts otherwise) before calling `onSubmit`, then closes via `onOpenChange(false)`.
- **Owner picker (`OwnerCorpField`, inner component):** maps the owner to a real EVE corporation. When no corp is selected it shows a debounced (250ms) search box backed by `searchCorporationsOnServer`; a query under 3 chars (or empty) shows nothing. Out-of-order responses are dropped via a request-seq ref. Picking a result stores `{ id, name }` and collapses to a chip with the corp's CCP logo + a clear (X) button. A legacy free-text owner loads as a chip with a null id (no logo) until cleared and re-picked.

### Emits / Calls
- `onSubmit({ name, structureTypeId, ownerCorporationId, ownerName, notes })` — `StructureFormValues` (exported). `ownerCorporationId`/`ownerName` are both null when no owner is set.
- `fetchStructureTypes()` — type catalog.
- `searchCorporationsOnServer(query)` — corp autocomplete (inside `OwnerCorpField`).

### Local State
- Outer `StructureFormDialog`: `types`.
- Inner `StructureForm`: `name`, `typeId` (string), `owner` (`{ id, name } | null`), `notes`.
- Inner `OwnerCorpField`: `query`, `results`, `loading`, `requestSeq` (ref).
