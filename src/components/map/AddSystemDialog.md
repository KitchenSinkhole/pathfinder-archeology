## AddSystemDialog

**Purpose:** Search the EVE universe by name and place a solar system on the map manually — without a tracked character jumping a wormhole into it (SPEC §6.5).
**File:** `src/components/map/AddSystemDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state. |
| onOpenChange | (open: boolean) => void | yes | Open/close callback. |
| mapId | string | yes | `ap_map.id` (digits); used in the search URL. |
| existingSystemIds | Set<number> | yes | EVE solar-system ids already visible on the map; flagged "on map" in the list. |
| onAdd | (systemId: number) => void | yes | Called with the chosen EVE solar-system id. The parent (`MapCanvas`) owns the POST + placement position. |

### Renders
A modal dialog with a search `Input` (magnifier icon, spinner while loading) over a scrollable results list. Each row shows system name, region / constellation, and the security label, plus an "on map" hint when already placed.

### Behaviour & Interactions
- Search is debounced 200ms; queries under 2 chars short-circuit to empty without a round trip.
- A `requestSeq` ref drops out-of-order responses so a slow earlier query can't overwrite a newer one.
- Keyboard: ArrowUp/ArrowDown move the active row (wrapping), Enter adds the active row. Mouse hover also sets the active row.
- Selecting a row calls `onAdd(systemId)` then closes the dialog. Re-adding a system already on the map is allowed (the server upsert flips it back to `visible`); the row is just flagged.
- All state (query, results, active index) resets when the dialog closes.

### Emits / Calls
- `searchSystemsOnServer({ mapId, query })` — debounced read fetch.
- `onAdd(systemId)` — on selection.

### Depends On
- `@/components/ui/dialog`, `@/components/ui/input`
- `searchSystemsOnServer` (`@/lib/map/client`)
- `SystemSearchResult` (`@/types`)

### Local State
- `query: string` — search box value.
- `results: SystemSearchResult[]` — latest search hits.
- `loading: boolean` — request in flight.
- `activeIndex: number` — keyboard/hover highlighted row.
