## setup-cookie.ts

**Purpose:** Signed, short-TTL cookie that unlocks the `/setup` ops console after a successful `SETUP_PASSWORD` check. The /setup route bypasses EVE SSO so an operator can troubleshoot a broken auth deploy; this cookie is the floor under that bypass.
**File:** `src/lib/auth/setup-cookie.ts`

---

### signSetupPayload(nowS?): string
Encodes `{ exp }` as `payloadB64url.sigB64url`, HMAC-SHA256 keyed on `AUTH_SECRET`. `exp` is `nowS + 14400` (4 hours). Exposed for tests.

### verifySetupPayload(token: string, nowS?): boolean
Verifies signature (timing-safe) and expiry; returns `true` for a valid unexpired token, `false` otherwise. Exposed for tests.

### setSetupCookie(): Promise<void>
Sets the `ap_setup` cookie using the shared `AUTH_COOKIE_OPTIONS` (httpOnly, `SameSite=Lax`, `secure` in prod) with a 4h `maxAge`. Call from a Server Action after a successful password check.

### readSetupCookie(): Promise<boolean>
Reads + verifies the cookie. Returns `true` if the console is unlocked.

### clearSetupCookie(): Promise<void>
Best-effort delete; swallows errors when the calling context can't mutate cookies (the 4h TTL bounds any stale cookie).

---

### Notes
- Mirrors [[link-cookie]] but with a payload of `{ exp }` only (no per-account binding — anyone with the password can unlock).
- Signature check is the security boundary: prevents a forged cookie from unlocking the console on a host that knows `AUTH_SECRET`.
- TTL is 4h so a left-open tab self-locks; rotating `SETUP_PASSWORD` invalidates active unlock cookies (the signature itself is keyed on `AUTH_SECRET`, not the password, but the `setupUnlockAction` won't re-mint once the env value changes).
- Node runtime only (`node:crypto`).
