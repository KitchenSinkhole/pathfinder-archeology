## sharedWorker.ts

**Purpose:** SharedWorker body — holds one WebSocket per browser origin and multiplexes it across every tab, reference-counting map subscriptions so each `subscribe`/`unsubscribe` frame is sent only on the first/last interested tab.
**File:** `src/lib/realtime/sharedWorker.ts`

### Behaviour & Interactions
- On `connect`, registers each tab's `MessagePort`, replies with the current status, and **connects the socket eagerly** (one cheap socket per origin) so `open` is the baseline — the degraded banner then reflects a real failure, not merely the absence of a subscription.
- Tab → worker messages: `{ type:'subscribe'|'unsubscribe', mapId }`. Worker → tab messages: `{ type:'status', status }` and `{ type:'message', envelope }`.
- One `WebSocket` to `apertureConfig.WS_PATH` (scheme derived from `self.location`). Reconnects with capped exponential backoff (`WS_RECONNECT_BASE_MS`/`WS_RECONNECT_MAX_MS`); on (re)connect it replays the full active subscription set.
- Inbound frames are loosely validated against `envelopeSchema` before fan-out; connection-state transitions (`connecting`/`open`/`closed`/`degraded`) broadcast to all ports.

### Emits / Calls
- Sends only `subscribe` / `unsubscribe` frames (broadcast-only socket).

### Depends On
- `./protocol` (`envelopeSchema`, `Envelope`), `aperture.config` (`WS_PATH`, backoff).

### Notes
- Instantiated client-side via `new SharedWorker(new URL('./sharedWorker.ts', import.meta.url), { type:'module' })` (see `useRealtime.tsx`).
- Browser-only: imports nothing server-side. Per-tab teardown on subscription is driven by the client provider's unmount, not by port-close detection.
