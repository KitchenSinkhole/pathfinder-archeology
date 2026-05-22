## protocol.ts

**Purpose:** Zod wire contracts for the realtime WebSocket transport — the `{task, load}` envelope and the fixed task vocabulary as direction-split discriminated unions.
**File:** `src/lib/realtime/protocol.ts`

The WS is broadcast-only (SPEC §§5–6): server fans `pg_notify('map:'||map_id,…)` events to subscribed sockets; clients only send `subscribe`/`unsubscribe`. Authorization is session-based (Auth.js) — no on-wire token handshake. Control-plane shapes are firm; data-bearing bodies are forward-declared (`data: z.unknown()`) and tightened in Stage 6 when the `ap_map_*` row schemas exist.

---

### Constants

- `SERVER_TO_CLIENT_TASKS` — `['mapUpdate','mapAccess','mapConnectionAccess','mapDeleted','characterUpdate','characterLogout','healthCheck','logData']`.
- `CLIENT_TO_SERVER_TASKS` — `['subscribe','unsubscribe']`.

### Types
- `ServerToClientTask` / `ClientToServerTask` — string-literal unions of the above.
- `Envelope` — `{ task, load: unknown }`.
- `ServerToClientMessage` / `ClientToServerMessage` — inferred from the discriminated unions; re-exported from `src/types/index.ts`.

### Schemas

- `envelopeSchema` — raw frame `{ task: <any task>, load: unknown }`. Use to peek at `task` before per-task validation.
- Control-plane loads (firm): `subscribeLoadSchema` / `unsubscribeLoadSchema` (`{ mapIds: number[] }`), `healthCheckLoadSchema` (`{ ts, ok?, listeners? }`), `mapDeletedLoadSchema` (`{ mapId }`), `characterLogoutLoadSchema` (`{ characterIds }`), `mapAccessLoadSchema` (`{ mapId, characterIds }`).
- Data-bearing loads (forward-declared): `mapUpdateLoadSchema` (`{ mapId, eventId?, kind?, data? }`), `mapConnectionAccessLoadSchema` (`{ mapId, data? }`), `characterUpdateLoadSchema` (`{ characterId, data? }`), `logDataLoadSchema` (`{ mapId, data? }`).
- `serverToClientMessageSchema` — `z.discriminatedUnion('task', …)` over the eight server tasks (envelope + typed load).
- `clientToServerMessageSchema` — discriminated union over `subscribe` / `unsubscribe`.

### Notes
- Payload shapes are derived from the rebuild's operational need, not legacy `pathfinder_websocket` shapes.
- Adding a task name requires updating the spec (CLAUDE.md "Realtime").
