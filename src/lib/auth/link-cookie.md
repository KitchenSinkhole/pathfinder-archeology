## link-cookie.ts

**Purpose:** Signed, short-TTL cookie that threads the current account's `userId` through the EVE OAuth round-trip so an "Add character" login links the new character to the existing `ap_user` instead of minting a fresh one.
**File:** `src/lib/auth/link-cookie.ts`

---

### signLinkPayload(userId: number, nowS?): string
Encodes `{ userId, exp }` as `payloadB64url.sigB64url`, HMAC-SHA256 keyed on `AUTH_SECRET`. `exp` is `nowS + 300`. Exposed for tests.

### verifyLinkPayload(token: string, nowS?): number | null
Verifies signature (timing-safe) and expiry; returns the `userId` or `null` for a tampered/expired/malformed token. Exposed for tests.

### setLinkCookie(userId: number): Promise<void>
Sets the `ap_link` cookie (httpOnly, `SameSite=Lax`, `secure` in prod, 5-min `maxAge`). Call from a Server Action.

### readLinkUserId(): Promise<number | null>
Reads + verifies the cookie, returning the linked `userId` or `null`.

### clearLinkCookie(): Promise<void>
Best-effort delete; swallows errors when the calling context can't mutate cookies (the TTL bounds any stale cookie).

---

### Notes
- Signature check is the security boundary: it prevents a forged cookie from attaching a character to an arbitrary account.
- Node runtime only (`node:crypto`).
