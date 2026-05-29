## session.ts

**Purpose:** Server-only account/session helpers wrapping Auth.js `auth()` — resolves the active character and the account's character roster, and centralizes the character-ownership authorization check.
**File:** `src/lib/session.ts`

---

### getSession(): Promise<Session | null>
The current Auth.js session, or `null` when logged out.

### requireSession(): Promise<Session>
The current session; `redirect('/')` to the public splash when (a) there is no session, or (b) the active character's `status !== 'active'` (kicked or banned characters lose every gated route on their next request, not just the next sign-in). Used by the `(app)` and `(admin)` layouts to gate the authenticated tree, and by every Server Action that mutates state.

### getActiveCharacter(): Promise<ApCharacter | null>
The full `ap_character` row for `session.characterId`, or `null` when logged out / character missing.

### getAccountCharacters(userId: number): Promise<AccountCharacter[]>
All characters on the account, ordered by name. Returns only display-safe fields (`id` as string, `name`, `status`, `authzLevel`, `trackingEnabled`) — never ESI tokens. `trackingEnabled` drives the header Characters panel toggles (Stage 17.5 follow-up).

### getMainCharacterId(userId: number): Promise<string | null>
The account's `ap_user.main_character_id` as a string (bigint isn't JSON-safe), or `null` when unset. Feeds the Account Settings "main" selector (Stage 17.5); login-time resolution / bootstrap lives in `auth.ts` (`resolveMainCharacter`).

### assertCharacterOwnership(characterId: bigint, userId: number): Promise<boolean>
True iff the character belongs to `userId` **and** is `status='active'`. Single source of truth for the character-ownership authorization check; reused by `setCharacterTrackingAction` (and any future per-character account action).

---

### AccountCharacter (type)
`{ id: string; name: string; status; authzLevel; trackingEnabled: boolean }` — the display-safe shape returned by `getAccountCharacters`.

### Notes
- `server-only` import guard — never bundled to the client.
