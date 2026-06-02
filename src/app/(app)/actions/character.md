## character.ts

**Purpose:** Server Actions for the multi-character account: toggle per-character location tracking, link another character via OAuth, and sign out. (Active-character *switching* was dropped in the Stage 17.5 follow-up — login lands on the account main and stays there.)
**File:** `src/app/(app)/actions/character.ts`

---

### setCharacterTrackingAction(characterId: string, mapId: string, enabled: boolean): Promise<TrackingResult>
The Characters-panel per-map checkbox. Validates character ownership (`assertCharacterOwnership`) and that the acting user can `canViewMap(sessionCharacter, mapId)`. Ensures the `ap_map_tracking_seed` marker exists for `(map, account)` (so deselecting the last character leaves an empty selection the next `subscribe` won't re-seed), then `startTrackingCharacter` (enable) / `stopTrackingCharacter` (disable) for that single map. Returns `{ ok: true }` or `{ ok: false, error }`. No `revalidatePath` — the panel drives its own state and re-fetches via `getMapTrackingAction`.

### getMapTrackingAction(mapId: string): Promise<MapTracking>
Read path for the panel: returns `{ mapName, trackedIds }` — the map's display name and the string ids of the **account's** characters tracked on `mapId` (joined through `ap_character.user_id`). Returns `{ mapName: null, trackedIds: [] }` for a malformed id or a map the acting user can't view.

### addCharacterAction(): Promise<void>
`requireSession()` → `setLinkCookie(userId)` → `signIn('eve', { redirectTo: '/maps' })`. The signed cookie makes the jwt callback link the newly-authed character onto the current account. Redirects (never returns normally).

### signOutAction(): Promise<void>
`signOut({ redirectTo: '/' })`.

---

### TrackingResult (type)
`{ ok: true } | { ok: false; error: string }`.

### MapTracking (type)
`{ mapName: string | null; trackedIds: string[] }`.

### Notes
- `'use server'` module — all exports are Server Actions.
