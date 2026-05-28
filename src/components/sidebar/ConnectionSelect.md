## ConnectionSelect

**Purpose:** Dropdown of connections incident to the active system, used to bind a wormhole signature to a placed connection.
**File:** `src/components/sidebar/ConnectionSelect.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode | yes | The active map system; filters connections to those incident to its `id`. |
| connections | MapConnectionEdge[] | yes | All connections on the map (filtered client-side). |
| systems | MapSystemNode[] | yes | All systems on the map (used to look up the other end's label). |
| value | string \| null | yes | The currently bound `ap_map_connection.id`, or `null`. |
| onValueChange | (next: string \| null) => void | yes | Fires when the user picks a different option (or clears). |
| disabled | boolean | no | Disables the trigger. Auto-disabled when no incident connections exist. |

### Renders
A shadcn `Select` listing each incident connection. Each option label is the other end's `alias ?? name`; when known, the security/class string is appended (e.g. "Liekuri (high)", "J231245 (C3)"). First option is an "—" sentinel mapped to `null`.

### Behaviour & Interactions
- No API call — works entirely off the props passed by `MapCanvas`.
- Auto-disables when the active system has no connections.
- Treats `__none__` as `null` in both directions.

### Depends On
- `Select*` from `@/components/ui/select`
- `MapConnectionEdge`, `MapSystemNode` from `@/types`
