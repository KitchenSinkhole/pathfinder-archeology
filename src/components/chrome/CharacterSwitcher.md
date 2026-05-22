## CharacterSwitcher

**Purpose:** Slide-in `Sheet` listing the account's characters; switches the active character, adds another via OAuth, or signs out.
**File:** `src/components/chrome/CharacterSwitcher.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| active | `{ id: string; name: string }` | yes | The currently-active character (drives the trigger chip) |
| characters | `SwitcherCharacter[]` | yes | All characters on the account (`id`, `name`, `status`) |

### Renders
A trigger button (active character's portrait + name) that opens a right-anchored Sheet: one selectable row per character, then "Add character" and "Sign out" buttons.

### Behaviour & Interactions
- Clicking a character calls `switchCharacterAction`; on `{ ok: false }` shows a `sonner` error toast, otherwise closes the Sheet. Clicking the active character just closes it.
- Non-`active` characters (kicked/banned) are disabled and labelled with their status.
- "Add character" / "Sign out" are `<form>`s posting `addCharacterAction` / `signOutAction` (both redirect).
- Switch runs inside `useTransition`; rows + footer buttons disable while pending.

### Emits / Calls
- `switchCharacterAction(id)`, `addCharacterAction()`, `signOutAction()` from `src/app/(app)/actions/character.ts`.

### Depends On
- `Sheet`, `Avatar`, `Button` UI primitives; `sonner` toast.

### Local State
- `open: boolean` — Sheet visibility.
- `pending` — transition state for an in-flight switch.

### Notes
- Portrait URLs are built inline against `images.evetech.net`; the dedicated image helper arrives in Stage 13.
