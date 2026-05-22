## jwks.ts

**Purpose:** Verify EVE SSO JWT access tokens against CCP's published JWK set, with the SPEC §7 one-re-fetch-per-10s cap.
**File:** `src/lib/auth/jwks.ts`

---

### verifyEveAccessToken(token: string): Promise<EveAccessTokenClaims>
`jwtVerify`s the token against a module-singleton `createRemoteJWKSet`, asserting `issuer = apertureConfig.SSO_EXPECTED_ISSUER` and `audience = env.AUTH_EVE_CLIENT_ID`, then Zod-decodes the claims.

**Returns:** `{ characterId: bigint, name, ownerHash, scopes: string[] }` — `characterId` parsed from the `CHARACTER:EVE:<id>` `sub`; `scopes` normalized from the `scp` claim (string or array).

**Throws:** on signature failure, issuer/audience mismatch, or claim-shape drift (Zod).

---

### __resetEveKeySetForTest(): void
Test-only. Drops the cached remote key set so a fresh fetch + cooldown cycle can be observed.

---

Notes:
- The remote key set uses `cooldownDuration = apertureConfig.JWK_REFETCH_MIN_INTERVAL_MS`. On an unknown `kid`, jose reloads at most once per cooldown window; repeated unknown-kid verifies inside the window throw without re-fetching — this is the footgun #3 cap.
- JWKS URI = `apertureConfig.SSO_JWKS_PATH` resolved against `env.AUTH_EVE_SSO_BASE` (TQ vs SISI).
