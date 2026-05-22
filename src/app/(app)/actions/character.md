## character.ts

**Purpose:** Server Actions for the multi-character session: switch the active character, link another character via OAuth, and sign out.
**File:** `src/app/(app)/actions/character.ts`

---

### switchCharacterAction(targetCharacterId: string): Promise<SwitchResult>
Validates that the target belongs to the current account and is `active` (`assertCharacterOwnership`), re-issues the JWT via `unstable_update({ characterId })`, and `revalidatePath('/', 'layout')`. Returns `{ ok: true }` or `{ ok: false, error }`.

### addCharacterAction(): Promise<void>
`requireSession()` → `setLinkCookie(userId)` → `signIn('eve', { redirectTo: '/maps' })`. The signed cookie makes the jwt callback link the newly-authed character onto the current account. Redirects (never returns normally).

### signOutAction(): Promise<void>
`signOut({ redirectTo: '/' })`.

---

### SwitchResult (type)
`{ ok: true } | { ok: false; error: string }`.

### Notes
- `'use server'` module — all exports are Server Actions.
