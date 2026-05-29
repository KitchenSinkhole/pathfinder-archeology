## MapInfoDialog

**Purpose:** Four-tab live snapshot of the open map — Summary, Systems, Connections, Users.
**File:** `src/components/dialogs/MapInfoDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state (owned by `MapCanvas`). |
| onOpenChange | (open: boolean) => void | yes | Open-state setter. |
| viewData | MapViewData | yes | The canvas's live map data (map meta, systems, connections). Realtime-current. |

### Renders
A `max-w-3xl` dialog with a `Tabs` strip. **Summary**: count tiles (systems / connections / online pilots) + a copy-to-clipboard share link (`${origin}/map/<id>`). **Systems**: scrollable table of every system (name/alias, region/constellation, security, status, statics), sorted by name. **Connections**: scrollable table (source → target resolved to system names, scope, mass status, jump size, EOL). **Users**: the online presence roster (pilot, current system name, ship) or an empty state.

### Behaviour & Interactions
- Reads everything from `viewData` (props) + `usePresenceForMap()` (context) — **no server call**. Reopening reflects whatever the canvas state currently is.
- The online-pilot count and Users roster come from the map-wide presence store, so they track realtime `characterUpdate` movement while the dialog is mounted.
- Share-link copy uses `navigator.clipboard` and toasts success/failure via `sonner`.

### Depends On
- `@/components/ui/dialog`, `@/components/ui/tabs`, `@/components/ui/button`
- `usePresenceForMap` from `@/components/map/MapPresenceContext` (must render inside `MapPresenceProvider`)
- Types `MapViewData`, `MapSystemNode`, `MapConnectionEdge`, `MapPresenceEntry` from `@/types`
