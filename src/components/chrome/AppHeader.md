## AppHeader

**Purpose:** Top page chrome for the authenticated app — branding link plus the character switcher.
**File:** `src/components/chrome/AppHeader.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| active | `{ id: string; name: string }` | yes | Active character, forwarded to the switcher chip |
| characters | `SwitcherCharacter[]` | yes | Account roster (incl. `authzLevel`), forwarded to the switcher |
| mainCharacterId | `string \| null` | yes | The account's main, forwarded to the switcher |

### Renders
A bordered header bar: an "Aperture" link to `/maps` on the left; on the right, the `ReferenceMenu` info menu next to the `CharacterSwitcher`.

### Depends On
- `CharacterSwitcher` (client) — the data props are resolved server-side in `(app)/layout.tsx`.
- `ReferenceMenu` (client) — header entry point for the static reference dialogs.
