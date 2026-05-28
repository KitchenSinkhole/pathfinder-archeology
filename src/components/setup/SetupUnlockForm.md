## SetupUnlockForm

**Purpose:** Single-input password form that calls `setupUnlockAction` to unlock the `/setup` ops console.
**File:** `src/components/setup/SetupUnlockForm.tsx`

### Renders
A `<form>` with one password `Input` and an unlock `Button`. Toasts on success (`'Unlocked.'`) or on the action's generic `'Invalid password.'` error.

### Behaviour & Interactions
- Submits via `useTransition` so the button can show a `Unlocking…` spinner state.
- Clears the input on success — the page rerenders unlocked via the action's `revalidatePath('/setup')`.
- Empty submissions short-circuit with a client-side toast instead of round-tripping.

### Emits / Calls
- `setupUnlockAction(password)` — Server Action that mints the `ap_setup` cookie on a constant-time-equal match.
