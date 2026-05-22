## server.ts

**Purpose:** Custom Node entry point (SPEC §5.5) — one process serving the Next.js app and the WebSocket upgrade handler on a shared HTTP server.
**File:** `server.ts`

### Behaviour
- `dev = NODE_ENV !== 'production'`; listens on `PORT` (default 3003) / `HOSTNAME` (default `0.0.0.0`).
- **Calls `loadEnvConfig` (`@next/env`) before any env-reading module is imported.** `tsx` has no dotenv loader, so without this `@/lib/env` would freeze `AUTH_SECRET=''` and the WS server would reject every upgrade with 401. Because static imports are hoisted, `wsServer` is imported **dynamically** (inside `app.prepare().then`) so it reads the now-loaded vars — using the same loader Next uses, so the cookie-decoding secret matches the app side.
- Prepares the Next app, creates an `http` server delegating to Next's request handler, then `attachWsServer(server)` wires the WS upgrade handler.
- Intentionally thin — all realtime logic lives in `src/lib/realtime/wsServer.ts` / `bus.ts`.
- Run via `pnpm dev` (`tsx watch server.ts`) and `pnpm start` (`tsx server.ts`); set `NODE_ENV=production` in the environment for a production run.

### Depends On
- `next`, `node:http`, `@next/env` (`loadEnvConfig`), `@/lib/realtime/wsServer` (`attachWsServer`, dynamically imported).
