## auth.ts

**Purpose:** Auth.js v5 setup — stateless JWT sessions backed by the EVE SSO provider, with login persistence and access-token rotation wired into the `jwt` callback.
**File:** `src/lib/auth.ts`

---

### handlers / auth / signIn / signOut
The standard Auth.js v5 exports. `handlers` is mounted by the `[...nextauth]` route; `auth` reads the session in server components/actions.

### Config
- `providers: [eveProvider()]`, `session.strategy: 'jwt'` (no DB session store — SPEC §7).
- **`jwt` callback:**
  - On initial sign-in (`account` + `profile` present): `persistLogin` upserts `ap_user`/`ap_character` with encrypted tokens, then the token carries `characterId` (string — bigint isn't JSON-safe), `userId`, and `accessTokenExpiresAt`.
  - On later calls: if within `SSO_TOKEN_REFRESH_BUFFER_S` of expiry, calls `refreshAccessToken` (which persists the rotated refresh token before returning) and refreshes the expiry hint from the DB. Refresh failures are swallowed so a revoked token degrades to logged-out rather than throwing.
- **`session` callback:** exposes `characterId` and `userId` only — never raw ESI tokens.

### persistLogin(profile, tokens): Promise<number>
Internal. Finds the character's existing `user_id` or creates a fresh `ap_user`, then upserts the `ap_character` row (encrypted access/refresh tokens, scopes, owner hash). Returns the resolved `userId`. Multi-character linking onto one user is deferred to Stage 5.

### Module augmentation
Adds `characterId`/`userId` to `Session` and `characterId`/`userId`/`accessTokenExpiresAt` to the `JWT`.

---

Notes:
- Corp/alliance ids are left null here; they require the ESI client (Stage 4) and are backfilled later.
- Node runtime only (crypto + pg).
