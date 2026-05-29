## DeleteAccountDialog

**Purpose:** Type-to-confirm account deletion — self-contained trigger button + confirmation dialog.
**File:** `src/components/account/DeleteAccountDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| confirmName | string | yes | The phrase (active character's name) the user must type to enable deletion |

### Renders
A destructive "Delete account" trigger button that opens a small dialog spelling out the cascade (characters removed, owned maps orphaned, history anonymized) with a text input and Cancel / Delete account buttons.

### Behaviour & Interactions
- The Delete button is disabled until the trimmed input exactly equals `confirmName`.
- On confirm, calls `deleteAccountAction` in a transition; success redirects via the action's `signOut` (no client navigation), so the only client-visible outcome is an error toast on failure.
- Closing the dialog clears the typed value.

### Emits / Calls
- `deleteAccountAction()` — from `@/app/(app)/actions/account`

### Depends On
- `Dialog`, `Button`, `Input` UI primitives
