## route.ts

**Purpose:** Mounts the Auth.js v5 catch-all handler for the EVE SSO flow (`/api/auth/*`, including `/api/auth/callback/eve`).
**File:** `src/app/api/auth/[...nextauth]/route.ts`

### Exports
- `GET` / `POST` — re-exported from `@/lib/auth` `handlers`.
- `runtime = 'nodejs'` — required because the auth code path uses `node:crypto` (token encryption) and `pg` (character persistence), neither of which runs on Edge.
