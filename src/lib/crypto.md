## crypto.ts

**Purpose:** AES-256-GCM AEAD for the ESI tokens stored on `ap_character`. The only place tokens are wrapped/unwrapped. SPEC §7.
**File:** `src/lib/crypto.ts`

---

### encryptToken(plaintext: string): string
Encrypts `plaintext` with a fresh random 96-bit IV. Returns base64 of `iv || authTag || ciphertext`.

**Returns:** opaque base64 blob suitable for storing in `ap_character.esi_access_token` / `esi_refresh_token`.

---

### decryptToken(blob: string): string
Inverse of `encryptToken`. Splits the IV, auth tag, and ciphertext back out and verifies the GCM auth tag.

**Throws:** if the auth tag does not verify (tampered/corrupt blob or wrong key).

---

Notes:
- Key comes from `env.ESI_TOKEN_ENC_KEY` (base64), which must decode to exactly 32 bytes; the module throws a clear error otherwise. The decoded key is cached after first use.
- Node `crypto` requires the Node runtime — any route using this must set `runtime = 'nodejs'`.
