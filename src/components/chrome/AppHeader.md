## AppHeader

**Purpose:** Top page chrome for the authenticated app — branding link plus the Characters panel.
**File:** `src/components/chrome/AppHeader.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| active | `{ id: string; name: string }` | yes | Identity character (account main), forwarded to the panel chip |
| characters | `PanelCharacter[]` | yes | Account roster (incl. `authzLevel`, `trackingEnabled`), forwarded to the panel |
| mainCharacterId | `string \| null` | yes | The account's main, forwarded to the panel |
| travelAnimation | boolean | yes | The account's connection-travel-animation toggle, forwarded to the panel |

### Renders
A bordered header bar: an "Aperture" link to `/maps` on the left; on the right, the `ReferenceMenu` info menu next to the `CharacterPanel`.

### Depends On
- `CharacterPanel` (client) — the data props are resolved server-side in `(app)/layout.tsx`.
- `ReferenceMenu` (client) — header entry point for the static reference dialogs.
