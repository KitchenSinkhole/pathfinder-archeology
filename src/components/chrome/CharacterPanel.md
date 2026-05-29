## CharacterPanel

**Purpose:** Slide-in `Sheet` (opened from the header character chip) that lets the user choose which of their characters Aperture tracks on the map, add another character via OAuth, open Account settings, or sign out. (Stage 17.5 follow-up — replaced the old active-character *switcher*; switching was dropped.)
**File:** `src/components/chrome/CharacterPanel.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| active | `{ id: string; name: string }` | yes | The session's identity character (account main); drives the trigger chip |
| characters | `PanelCharacter[]` | yes | All characters on the account (`id`, `name`, `status`, `authzLevel`, `trackingEnabled`) |
| mainCharacterId | `string \| null` | yes | The account's main — rendered as a "main" tag and forwarded to Account settings |

### Renders
A trigger button (active character's portrait + name) opening a right-anchored Sheet: one row per character with a tracking checkbox, then "Add character", "Account settings", and "Sign out". Also renders the (initially closed) `AccountSettingsDialog`.

### Behaviour & Interactions
- Each **active** character row has a tracking checkbox bound to `trackingEnabled`. Toggling calls `setCharacterTrackingAction(id, next, currentMapId)` inside `useTransition`; the local state flips optimistically and reverts on `{ ok: false }` (with a `sonner` error toast).
- `currentMapId` is derived from the `/map/[[...slug]]` route via `useParams()` (first numeric slug segment), or `null` when not on a map (e.g. `/maps`, admin pages). Enabling while off a map still flips the flag; tracking starts on the next map open.
- Non-`active` (kicked/banned) characters show their status label instead of a checkbox and are dimmed.
- The account's main is tagged "main" inline.
- "Add character" / "Sign out" are `<form>`s posting `addCharacterAction` / `signOutAction` (both redirect). "Account settings" closes the Sheet and opens `AccountSettingsDialog`.

### Emits / Calls
- `setCharacterTrackingAction(id, enabled, currentMapId)`, `addCharacterAction()`, `signOutAction()` from `src/app/(app)/actions/character.ts`.

### Depends On
- `Sheet`, `Avatar`, `Button` UI primitives; `sonner` toast; `useParams` (next/navigation).
- `AccountSettingsDialog` — main-character + delete-account surface.

### Local State
- `open: boolean` — Sheet visibility.
- `settingsOpen: boolean` — Account settings dialog visibility.
- `tracking: Record<string, boolean>` — optimistic per-character tracking toggle state.
- `pending` — transition state for an in-flight toggle.

### Notes
- Portrait URLs are built inline against `images.evetech.net`.
- Used by both the app header (`AppHeader`) and the admin header (`(admin)/admin/layout.tsx`).
