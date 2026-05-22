## bus.ts

**Purpose:** Server-side Postgres LISTEN multiplexer — the read end of the §6.5 realtime pipeline; reference-counts `map:<id>` channel subscriptions on one dedicated `pg` Client and wraps each notification into a `mapUpdate` envelope.
**File:** `src/lib/realtime/bus.ts`

---

### bus.subscribe(mapId: bigint, listener: (message: ServerToClientMessage) => void): () => void
Registers a listener for one map's events. First subscriber on a map issues `LISTEN "map:<id>"`; the returned unsubscribe drops the listener and `UNLISTEN`s when the last one leaves. Lazily connects the dedicated client on first use.

**Returns:** an unsubscribe function.

---

### bus.isHealthy(): boolean
Whether the dedicated LISTEN connection is currently live. Used by the WS health probe.

---

### Notes
- Uses its **own `pg.Client`** (not the pooled `db`) because LISTEN occupies a connection for its lifetime.
- On notification, parses the payload as JSON (non-JSON → `{}`), derives `mapId` from the channel name, and emits `{ task:'mapUpdate', load:{ mapId, kind?, data } }`. `kind` is lifted from the payload when present. Until Stage 9 writes structured payloads, `data` is whatever JSON the trigger emitted.
- Reconnects with exponential backoff (`WS_RECONNECT_BASE_MS`/`WS_RECONNECT_MAX_MS`) and re-issues LISTEN for all live channels on reconnect.
- Singleton across HMR via a `globalThis` guard (mirrors `db/client.ts`).
- No `import 'server-only'`: this module is loaded by the custom `server.ts` outside Next's bundler (where the `server-only` shim doesn't resolve). It is only imported by `wsServer.ts` and tests — never by a client component.

### Depends On
- `pg` (`Client`), `./protocol` (`ServerToClientMessage`), `aperture.config` (channel prefix, backoff), `@/lib/env`.
