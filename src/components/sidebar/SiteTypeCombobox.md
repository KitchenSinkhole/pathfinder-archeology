## SiteTypeCombobox

**Purpose:** Editable combobox for a cosmic signature's site name — suggests catalog names filtered by system class + group while still accepting free text.
**File:** `src/components/sidebar/SiteTypeCombobox.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| security | string \| null | yes | System class label (`MapSystemNode.security`), e.g. `'C3'`, `'H'`. Drives which suggestions show. |
| groupKey | CosmicSignatureGroupKey | yes | The non-wormhole group (`combat`/`relic`/`data`/`gas`/`ore`/`ghost`). |
| value | string \| null | yes | Currently stored site name (`sig.name`). |
| onValueChange | (next: string \| null) => void | yes | Called on commit with the trimmed value, or `null` when empty. |
| disabled | boolean | no | Disables the input. |

### Renders
A text input with a portalled suggestion list (`<ul>` rendered via `createPortal` into `document.body`) shown on focus/typing. Portalling is necessary because the list lives inside an `overflow-hidden` table container (`SignatureModule`) which would otherwise clip an inline absolutely-positioned dropdown. Position is captured from the input's `getBoundingClientRect` on each open.

### Behaviour & Interactions
- Suggestions come from `sitesForClassAndGroup(security, groupKey)`; an empty result degrades to a plain free-text input (no list).
- List opens on focus and while typing; filters by case-insensitive substring of the draft. An empty/unchanged draft shows the full list.
- Selecting an option uses `onMouseDown` + `preventDefault` so the value is set before the input's blur unmounts the list.
- Controlled draft, commit-on-blur (trimmed; `'' → null`); re-syncs from `value` only when not focused, so optimistic apply / realtime updates don't clobber mid-edit typing. Mirrors `SignatureModule`'s `EditableTextCell`.

### Emits / Calls
- `onValueChange(next)` — on blur commit or option click.
- `sitesForClassAndGroup(security, groupKey)` — `@/lib/map/signatureSites`.

### Local State
- `draft: string` — in-progress text.
- `open: boolean` — whether the suggestion list is visible.
- `dropdownStyle: CSSProperties` — `fixed` position computed from the input's `getBoundingClientRect` on open; fed to the portalled list.
- `focusedRef` — guards the value→draft re-sync while editing.
- `inputRef` — ref to the `<Input>` DOM node; used to compute dropdown position.
