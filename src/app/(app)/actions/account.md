## account.ts

**Purpose:** Account self-service Server Actions over `ap_user` (Stage 17.5) — set the main character and delete the account.
**File:** `src/app/(app)/actions/account.ts`

---

### setMainCharacterAction(targetCharacterId: string): Promise<AccountActionResult>
Sets `ap_user.main_character_id` to `targetCharacterId` for the current account. Validates the target is an active, owned character via `assertCharacterOwnership`. Revalidates the `/` layout so the header / switcher reflect the new main. Returns `{ ok: false, error }` on an invalid or unowned target.

**Returns:** `{ ok: true }` on success.

---

### setConnectionTravelAnimationAction(enabled: boolean): Promise<AccountActionResult>
Sets `ap_user.connection_travel_animation` for the current account. Revalidates the `/` layout so the toggle's initial state (threaded through the app layout) and any open map reflect the change. Always returns `{ ok: true }` — there is nothing to validate beyond the session.

---

### deleteAccountAction(): Promise<AccountActionResult>
Hard-deletes the `ap_user` row for the current session. The FK cascade removes characters / roles / tracking; `ap_map_event` and `ap_structure_event` rows keep their history with `character_id` set null; owned maps are orphaned (`owner_character_id` set null). No soft-delete grace — irreversible. On success calls `signOut({ redirectTo: '/' })`, which throws a redirect (the trailing `{ ok: true }` is unreachable but satisfies the type). Returns `{ ok: false, error }` only if the delete itself fails.

---

### AccountActionResult (type)
`{ ok: true } | { ok: false; error: string }` — mirrors the small result union in `actions/character.ts`.
