## wsServer.ts

**Purpose:** Node-runtime WebSocket server attached to the shared Next.js HTTP server (SPEC §5.5); broadcast-only fan-out of `mapUpdate` envelopes from the LISTEN bus, with session-authorized `subscribe`/`unsubscribe`.
**File:** `src/lib/realtime/wsServer.ts`

---

### attachWsServer(httpServer: http.Server): WebSocketServer
Wires a `noServer` `ws` server onto the HTTP server's `upgrade` event. Only upgrades requests to `apertureConfig.WS_PATH`; all other upgrade requests are left for Next/HMR. Returns the `WebSocketServer`.

Per connection:
- **Auth at upgrade:** decodes the Auth.js v5 session cookie (`__Secure-authjs.session-token` / `authjs.session-token`) via `next-auth/jwt` `decode` keyed on `AUTH_SECRET`. No/invalid session → `401` and the socket is destroyed.
- **subscribe:** validated by `clientToServerMessageSchema`; each map id is filtered through `canViewMap(characterId, mapId)` (Stage 15 — existence + soft-delete + scope/owner/role rights all in one). Requests for maps the actor cannot see are silently dropped (no acknowledgement; existence is not leaked over realtime). Allowed ids are wired to `bus.subscribe`. **Tracking target (Stage 17.5 follow-up):** the viewed map becomes the tracking target for the whole account — `enabledAccountCharacterIds(userId)` (active + `tracking_enabled`) are passed to `trackCharactersOnMap`, which folds each onto the viewed map and moves them off any other (single last-open map per character). Tracking is server-side and survives tab close; *disabling* a character is an explicit action in the Characters panel. Multiple tabs on different maps → last subscribe wins.
- **unsubscribe:** tears down the matching bus subscriptions (does not stop location tracking).
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
- `ws`, `next-auth/jwt` (`decode`), `@/lib/auth/rights` (`canViewMap`), `@/lib/jobs/tracking` (`trackCharactersOnMap`), `@/db/client` + `@/db/schema` (`apCharacter`, for the enabled-roster query), `drizzle-orm` (`and`/`eq`), `./bus`, `./protocol`, `aperture.config`, `@/lib/env`.
