## AccountSettingsDialog

**Purpose:** Account self-service dialog — pick the account's main character (with per-character role display) and reach account deletion.
**File:** `src/components/account/AccountSettingsDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state |
| onOpenChange | (open: boolean) => void | yes | Open-state setter (owned by `CharacterPanel`) |
| characters | AccountCharacter[] | yes | The account roster (`id`, `name`, `status`, `authzLevel`) |
| mainCharacterId | string \| null | yes | Current main; `null` until bootstrapped on first login |
| activeCharacter | { id: string; name: string } | yes | The signed-in character; its name is the delete confirmation phrase |

### Renders
A roster list — each row shows portrait, name, role label (Member / Manager / Admin), and either a "Main" marker (current main), the kicked/banned status, or a "Set as main" button. Below it, a destructive-bordered "Delete account" section embedding `DeleteAccountDialog`.

### Behaviour & Interactions
- `mainId` is local optimistic state seeded from `mainCharacterId`; clicking "Set as main" calls `setMainCharacterAction` in a transition and moves the marker on success, toasting on failure.
- Only `active` characters that aren't already main are selectable; the in-flight transition disables all set-main buttons.

### Emits / Calls
- `setMainCharacterAction(id)` — from `@/app/(app)/actions/account`

### Depends On
- `DeleteAccountDialog` — the type-to-confirm deletion flow
- `Dialog`, `Avatar`, `Button` UI primitives

### Exports
- `AccountCharacter` type — `{ id; name; status; authzLevel }`, the roster row shape.
