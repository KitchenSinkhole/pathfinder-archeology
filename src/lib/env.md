## env.ts

**Purpose:** Zod-validated `process.env` reader. The one place env vars become typed values. Import `env` instead of touching `process.env` directly anywhere else in the app.
**File:** `src/lib/env.ts`

---

### env
A frozen object built from `schema.parse(process.env)` at import time. Throws (loudly) on first import if a required var is missing or malformed — boundary validation per SPEC §5 / "validate only at system boundaries".

Fields:
- `DATABASE_URL` — required, defaulted to the local compose connection string.
- `AUTH_SECRET`, `AUTH_EVE_CLIENT_ID`, `AUTH_EVE_CLIENT_SECRET`, `ESI_TOKEN_ENC_KEY` — **required in production** (enforced by a `superRefine` that only fires when `NODE_ENV === 'production'`), optional elsewhere so a fresh clone can `pnpm dev`, migrate, and test without `.env.local`. No dotenv loader exists in the repo; `next dev` injects `.env.local` and `tsx` scripts inherit the shell env.
- `AUTH_EVE_SSO_BASE` — EVE SSO base URL; defaulted to `https://login.eveonline.com` (point at `https://sisilogin.testeveonline.com` for SISI).
- `ESI_BASE_URL` — ESI base URL; defaulted to `https://esi.evetech.net`. Used by the Stage 4 ESI client to build request URLs.
- `EVE_USER_AGENT` — required by Stage 4 (ESI client); defaulted.
- `NODE_ENV` — narrowed to `development | test | production`.

### Env
Inferred type alias for the parsed shape.
