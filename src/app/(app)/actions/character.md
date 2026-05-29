## character.ts

**Purpose:** Server Actions for the multi-character account: toggle per-character location tracking, link another character via OAuth, and sign out. (Active-character *switching* was dropped in the Stage 17.5 follow-up — login lands on the account main and stays there.)
**File:** `src/app/(app)/actions/character.ts`

---

### setCharacterTrackingAction(characterId: string, enabled: boolean, currentMapId: string | null): Promise<TrackingResult>
The Characters-panel toggle. Validates ownership (`assertCharacterOwnership`), sets `ap_character.tracking_enabled`. On **disable** calls `stopAllTrackingForCharacter` (poll self-terminates next tick). On **enable**, if `currentMapId` is a map the acting user can `canViewMap`, calls `startTrackingCharacter` for it so the pilot appears immediately; otherwise tracking resumes on the next map open. `revalidatePath('/', 'layout')`. Returns `{ ok: true }` or `{ ok: false, error }`.

### addCharacterAction(): Promise<void>
`requireSession()` → `setLinkCookie(userId)` → `signIn('eve', { redirectTo: '/maps' })`. The signed cookie makes the jwt callback link the newly-authed character onto the current account. Redirects (never returns normally).

### signOutAction(): Promise<void>
`signOut({ redirectTo: '/' })`.

---

### TrackingResult (type)
`{ ok: true } | { ok: false; error: string }`.

### Notes
- `'use server'` module — all exports are Server Actions.
