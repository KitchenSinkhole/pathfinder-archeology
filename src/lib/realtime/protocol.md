## protocol.ts

**Purpose:** Zod wire contracts for the realtime WebSocket transport — the `{task, load}` envelope and the fixed task vocabulary as direction-split discriminated unions.
**File:** `src/lib/realtime/protocol.ts`

The WS is broadcast-only (SPEC §§5–6): server fans `pg_notify('map:'||map_id,…)` events to subscribed sockets; clients only send `subscribe`/`unsubscribe`. Authorization is session-based (Auth.js) — no on-wire token handshake. Control-plane shapes are firm. The `mapUpdate` body is the tightened map-event payload (Stage 9.1); the remaining data-bearing bodies stay forward-declared (`data: z.unknown()`).

---

### Constants

- `SERVER_TO_CLIENT_TASKS` — `['mapUpdate','mapAccess','mapConnectionAccess','mapDeleted','characterUpdate','characterLogout','healthCheck','logData']`.
- `CLIENT_TO_SERVER_TASKS` — `['subscribe','unsubscribe']`.

### Types
- `ServerToClientTask` / `ClientToServerTask` — string-literal unions of the above.
- `Envelope` — `{ task, load: unknown }`.
- `ServerToClientMessage` / `ClientToServerMessage` — inferred from the discriminated unions; re-exported from `src/types/index.ts`.
- `MapEventPayload` — inferred from `mapEventPayloadSchema`; the realtime `mapUpdate.load.data` body and the jsonb `ap_map_event.payload`.
- `MapEventKind` — the 12 seeded `ap_event_kind` values (also `MAP_EVENT_KINDS` const tuple).
- `MapEventPatch<K>` — the payload for kind `K` minus `kind`/`eventId`; the body a mutation's `mutate()` returns.

### Schemas

- `envelopeSchema` — raw frame `{ task: <any task>, load: unknown }`. Use to peek at `task` before per-task validation.
- Control-plane loads (firm): `subscribeLoadSchema` / `unsubscribeLoadSchema` (`{ mapIds: number[] }`), `healthCheckLoadSchema` (`{ ts, ok?, listeners? }`), `mapDeletedLoadSchema` (`{ mapId }`), `characterLogoutLoadSchema` (`{ characterIds }`), `mapAccessLoadSchema` (`{ mapId, characterIds }`).
- `mapEventPayloadSchema` — `z.discriminatedUnion('kind', …)` over the 12 event kinds. Every variant is `{ kind, eventId, ...patch }`: `system.added`/`connection.create`/`signature.create`/`map.create` carry the full body (system/edge mirror `MapSystemNode`/`MapConnectionEdge`); `*.updated`/`*.update` carry `{ id, ...partial }`; `*.removed`/`*.delete` carry `{ id }`. Timestamps (`rallyAt`, `eolAt`, `expiresAt`, `deletedAt`) are ISO strings.
- `mapUpdateLoadSchema` (`{ mapId, kind?, data?: MapEventPayload }`) — `bus.ts` builds `{ mapId, kind, data }` from the notify payload.
- Other data-bearing loads (forward-declared): `mapConnectionAccessLoadSchema` (`{ mapId, data? }`), `characterUpdateLoadSchema` (`{ characterId, data? }`), `logDataLoadSchema` (`{ mapId, data? }`).
- `serverToClientMessageSchema` — `z.discriminatedUnion('task', …)` over the eight server tasks (envelope + typed load).
- `clientToServerMessageSchema` — discriminated union over `subscribe` / `unsubscribe`.

### Notes
- Payload shapes are derived from the rebuild's operational need, not legacy `pathfinder_websocket` shapes.
- Adding a task name requires updating the spec (CLAUDE.md "Realtime").
