## ReferenceMenu

**Purpose:** Header "Info" menu that launches the static reference dialogs.
**File:** `src/components/chrome/ReferenceMenu.tsx`

### Renders
An `Info` icon button (`MenuTrigger`) opening a dropdown with "System effects" and "Jump info" items. Mounts `SystemEffectsDialog` and `JumpInfoDialog` and owns their open-state.

### Behaviour & Interactions
- Each menu item sets its dialog's local open flag; the dialogs are controlled (`open`/`onOpenChange`).
- Client component; mounted in the server `AppHeader`.

### Depends On
- `Menu`/`MenuTrigger`/`MenuContent`/`MenuItem` — `@/components/ui/menu`
- `Button` — `@/components/ui/button`
- `SystemEffectsDialog`, `JumpInfoDialog` — `@/components/dialogs/*`
