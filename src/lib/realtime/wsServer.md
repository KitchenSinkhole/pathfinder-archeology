## wsServer.ts

**Purpose:** Node-runtime WebSocket server attached to the shared Next.js HTTP server (SPEC §5.5); broadcast-only fan-out of `mapUpdate` envelopes from the LISTEN bus, with session-authorized `subscribe`/`unsubscribe`.
**File:** `src/lib/realtime/wsServer.ts`

---

### attachWsServer(httpServer: http.Server): WebSocketServer
Wires a `noServer` `ws` server onto the HTTP server's `upgrade` event. Only upgrades requests to `apertureConfig.WS_PATH`; all other upgrade requests are left for Next/HMR. Returns the `WebSocketServer`.

Per connection:
- **Auth at upgrade:** decodes the Auth.js v5 session cookie (`__Secure-authjs.session-token` / `authjs.session-token`) via `next-auth/jwt` `decode` keyed on `AUTH_SECRET`. No/invalid session → `401` and the socket is destroyed.
- **subscribe:** validated by `clientToServerMessageSchema`; map ids are filtered to those that exist and are not soft-deleted (interim authz — any logged-in character, matching `loadMapForView`; per-map rights are Stage 15), then each is wired to `bus.subscribe`.
- **unsubscribe:** tears down the matching bus subscriptions.
- Malformed frames are dropped silently.
- **Heartbeat:** every `WS_HEARTBEAT_MS` the server `ping`s each socket (terminating any that missed the prior pong) and sends an app-level `healthCheck` envelope so a quiet map still clears the client's degraded banner.
- On close, all of the socket's bus subscriptions are released.

---

### isWsServerAttached(): boolean
Whether `attachWsServer` has run in this process.

### Notes
- The socket is **broadcast-only** — clients never mutate over it (CLAUDE.md "Realtime").
- No `import 'server-only'`: loaded by the custom `server.ts` outside Next's bundler (the `server-only` shim doesn't resolve there); only `server.ts` and tests import it.

### Depends On
- `ws`, `next-auth/jwt` (`decode`), `drizzle-orm`, `@/db/client` + `apMap`, `./bus`, `./protocol`, `aperture.config`, `@/lib/env`.
