## env.ts

**Purpose:** Zod-validated `process.env` reader. The one place env vars become typed values. Import `env` instead of touching `process.env` directly anywhere else in the app.
**File:** `src/lib/env.ts`

---

### env
A frozen object built from `schema.parse(process.env)` at import time. Throws (loudly) on first import if a required var is missing or malformed — boundary validation per SPEC §5 / "validate only at system boundaries".

Stage 0 fields:
- `DATABASE_URL` — required, defaulted to the local compose connection string.
- `AUTH_SECRET`, `AUTH_EVE_CLIENT_ID`, `AUTH_EVE_CLIENT_SECRET`, `ESI_TOKEN_ENC_KEY` — required by Stage 2 (Auth); accepts empty strings in Stage 0 so a fresh clone can `pnpm dev` without `.env.local`. **Tighten to `.min(1)` in Stage 2.**
- `EVE_USER_AGENT` — required by Stage 4 (ESI client); defaulted.
- `NODE_ENV` — narrowed to `development | test | production`.

### Env
Inferred type alias for the parsed shape.
