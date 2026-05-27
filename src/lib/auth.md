## auth.ts

**Purpose:** Auth.js v5 setup — stateless JWT sessions backed by the EVE SSO provider, with login persistence and access-token rotation wired into the `jwt` callback.
**File:** `src/lib/auth.ts`

---

### handlers / auth / signIn / signOut / unstable_update
The standard Auth.js v5 exports. `handlers` is mounted by the `[...nextauth]` route; `auth` reads the session in server components/actions; `unstable_update` re-issues the JWT for the character-switch flow.

### Config
- `providers: [eveProvider()]`, `session.strategy: 'jwt'` (no DB session store — SPEC §7).
- **`cookies` block** (SPEC §11 Q9 closure): the `sessionToken`, `callbackUrl`, and `csrfToken` cookies all carry `AUTH_COOKIE_OPTIONS` from `@/lib/cookies` (`httpOnly`, `sameSite: 'lax'`, `secure` in production, `path: '/'`). Cookie names stay at the Auth.js defaults (`authjs.session-token`, etc.).
- **`jwt` callback:**
  - On initial sign-in (`account` + `profile` present): reads the signed `ap_link` cookie (`link-cookie.ts`) to resolve an "Add character" link target, calls `persistLogin(..., linkUserId)`, clears the cookie, then the token carries `characterId` (string — bigint isn't JSON-safe), `userId`, and `accessTokenExpiresAt`. **Stage 15:** also fires `syncCharacterAuthz(characterId)` to reconcile `authz_level`, affiliations, and corp-title role memberships against ESI — best-effort, ESI failure is logged but does not block login.
  - On `trigger === 'update'` (character switch): re-validates that the requested `characterId` belongs to `token.userId` and is `active`, then re-points `characterId` and resets `accessTokenExpiresAt` from that character's DB expiry. An invalid target leaves the token unchanged.
  - On later calls: if within `SSO_TOKEN_REFRESH_BUFFER_S` of expiry, calls `refreshAccessToken` (which persists the rotated refresh token before returning) and refreshes the expiry hint from the DB. Refresh failures are swallowed so a revoked token degrades to logged-out rather than throwing.
- **`session` callback:** exposes `characterId` and `userId` only — never raw ESI tokens.

### persistLogin(profile, tokens, linkUserId?): Promise<number>
Internal. Resolves the owning `ap_user`: an already-seen character keeps its `user_id` (never re-homed); an unseen character with a valid `linkUserId` is attached to that account; otherwise a fresh `ap_user` is minted. Then upserts the `ap_character` row (encrypted access/refresh tokens, scopes, owner hash). Returns the resolved `userId`.

### Module augmentation
Adds `characterId`/`userId` to `Session` and `characterId`/`userId`/`accessTokenExpiresAt` to the `JWT`.

---

Notes:
- Corp/alliance ids are refreshed by `syncCharacterAuthz` on every sign-in (Stage 15). The legacy "filled in later" note no longer applies.
- Node runtime only (crypto + pg).
