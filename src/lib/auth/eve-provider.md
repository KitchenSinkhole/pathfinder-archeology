## eve-provider.ts

**Purpose:** The Auth.js v5 custom EVE SSO OAuth2 provider plus the persisted refresh-token rotation function (SPEC §7).
**File:** `src/lib/auth/eve-provider.ts`

---

### eveProvider(config?): OAuthConfig<EveProfile>
Builds the `id: 'eve'` OAuth2 provider: authorize/token endpoints from `aperture.config` + `env.AUTH_EVE_SSO_BASE`, scopes from `apertureConfig.ESI_SCOPES`, `checks: ['pkce', 'state']`. EVE has no real userinfo endpoint, so `userinfo.request` verifies the JWT access token via `verifyEveAccessToken`, and `profile()` maps the claims to `{ id, name }`. `userinfo.url` is set to EVE's `/oauth/verify` endpoint only to satisfy @auth/core's config assertion and `as` builder — it is never fetched because `request` takes precedence.

---

### refreshAccessToken(characterId: bigint): Promise<string>
Refreshes a character's ESI access token via CCP's `/v2/oauth/token` (`grant_type=refresh_token`, HTTP Basic client auth).

**Order of operations (load-bearing):** decrypt stored refresh token → POST → Zod-decode `{ access_token, refresh_token, expires_in }` → **`await` the `UPDATE` that writes the rotated refresh token + new access token** → only then return the access token. The DB write must stay strictly before the return — this is the footgun #2 fix verified by `tests/integration/auth-rotation.test.ts`.

**Returns:** the freshly-issued access token (plaintext, for immediate use by the caller).

**Throws:** if no refresh token is stored, the HTTP call fails, or the response shape drifts.

---

Notes:
- Uses `node:crypto` (via `crypto.ts`) and `pg` — Node runtime only.
- Tokens are written as ciphertext (`encryptToken`); only the returned value is plaintext.
