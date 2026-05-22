## useRealtime.tsx

**Purpose:** Client-side realtime façade — boots the SharedWorker, exposes the connection status and most-recent envelope through context, and provides map subscribe/unsubscribe.
**File:** `src/lib/realtime/useRealtime.tsx`

### Exports

#### `RealtimeProvider` (component)
Mounts the SharedWorker once, relays its status/messages into React state, and provides the context. Because React runs child effects before parent effects, a map page's `useMapSubscription` calls `subscribe()` before this provider's effect has created the port; requested map ids are recorded in a `desiredRef` set and flushed to the worker once the port is ready. Falls back to permanent `degraded` status when `SharedWorker` is unavailable (e.g. Safari). Runs a staleness watchdog: if no traffic (including the server heartbeat) arrives within `WS_HEALTH_STALE_MS` while the socket claims `open`, it forces `degraded` — never silently stale (SPEC §71).

| Prop | Type | Required | Description |
|---|---|---|---|
| children | ReactNode | yes | App subtree that can read realtime context. |

#### `useRealtime(): { status, lastEvent, subscribe, unsubscribe }`
Context accessor; throws outside a `RealtimeProvider`. `status: RealtimeStatus`; `lastEvent: Envelope | null` (exposed for Stage 9 — not yet merged into the canvas).

#### `useMapSubscription(mapId: number | null): void`
Subscribes to one map for the calling component's lifetime; unsubscribes on unmount.

### Types
- `RealtimeStatus` — `'connecting' | 'open' | 'closed' | 'degraded'` (re-exported from `src/types/index.ts`).

### Depends On
- `./protocol` (`envelopeSchema`, `Envelope`), `./sharedWorker` (via `new SharedWorker(new URL(...))`), `aperture.config`.
