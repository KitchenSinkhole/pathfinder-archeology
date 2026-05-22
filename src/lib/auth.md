## auth.ts

**Purpose:** Auth.js v5 setup — stateless JWT sessions backed by the EVE SSO provider, with login persistence and access-token rotation wired into the `jwt` callback.
**File:** `src/lib/auth.ts`

---

### handlers / auth / signIn / signOut / unstable_update
The standard Auth.js v5 exports. `handlers` is mounted by the `[...nextauth]` route; `auth` reads the session in server components/actions; `unstable_update` re-issues the JWT for the character-switch flow.

### Config
- `providers: [eveProvider()]`, `session.strategy: 'jwt'` (no DB session store — SPEC §7).
- **`jwt` callback:**
  - On initial sign-in (`account` + `profile` present): reads the signed `ap_link` cookie (`link-cookie.ts`) to resolve an "Add character" link target, calls `persistLogin(..., linkUserId)`, clears the cookie, then the token carries `characterId` (string — bigint isn't JSON-safe), `userId`, and `accessTokenExpiresAt`.
  - On `trigger === 'update'` (character switch): re-validates that the requested `characterId` belongs to `token.userId` and is `active`, then re-points `characterId` and resets `accessTokenExpiresAt` from that character's DB expiry. An invalid target leaves the token unchanged.
  - On later calls: if within `SSO_TOKEN_REFRESH_BUFFER_S` of expiry, calls `refreshAccessToken` (which persists the rotated refresh token before returning) and refreshes the expiry hint from the DB. Refresh failures are swallowed so a revoked token degrades to logged-out rather than throwing.
- **`session` callback:** exposes `characterId` and `userId` only — never raw ESI tokens.

### persistLogin(profile, tokens, linkUserId?): Promise<number>
Internal. Resolves the owning `ap_user`: an already-seen character keeps its `user_id` (never re-homed); an unseen character with a valid `linkUserId` is attached to that account; otherwise a fresh `ap_user` is minted. Then upserts the `ap_character` row (encrypted access/refresh tokens, scopes, owner hash). Returns the resolved `userId`.

### Module augmentation
Adds `characterId`/`userId` to `Session` and `characterId`/`userId`/`accessTokenExpiresAt` to the `JWT`.

---

Notes:
- Corp/alliance ids are left null here; they require the ESI client (Stage 4) and are backfilled later.
- Node runtime only (crypto + pg).
