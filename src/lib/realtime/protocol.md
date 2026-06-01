## protocol.ts

**Purpose:** Zod wire contracts for the realtime WebSocket transport — the `{task, load}` envelope and the fixed task vocabulary as direction-split discriminated unions.
**File:** `src/lib/realtime/protocol.ts`

The WS is broadcast-only (SPEC §§5–6): server fans `pg_notify('map:'||map_id,…)` events to subscribed sockets; clients only send `subscribe`/`unsubscribe`. Authorization is session-based (Auth.js) — no on-wire token handshake. Control-plane shapes are firm. The `mapUpdate` body is the tightened map-event payload (Stage 9.1); the remaining data-bearing bodies stay forward-declared (`data: z.unknown()`).

---

### Constants

- `SERVER_TO_CLIENT_TASKS` — `['mapUpdate','mapAccess','mapConnectionAccess','mapDeleted','characterUpdate','characterLogout','healthCheck','logData','systemNotification']`.
- `CLIENT_TO_SERVER_TASKS` — `['subscribe','unsubscribe']`.

### Types
- `ServerToClientTask` / `ClientToServerTask` — string-literal unions of the above.
- `Envelope` — `{ task, load: unknown }`.
- `ServerToClientMessage` / `ClientToServerMessage` — inferred from the discriminated unions; re-exported from `src/types/index.ts`.
- `MapEventPayload` — inferred from `mapEventPayloadSchema`; the realtime `mapUpdate.load.data` body and the jsonb `ap_map_event.payload`.
- `MapEventKind` — the 14 seeded `ap_event_kind` values (also `MAP_EVENT_KINDS` const tuple). Stage 16.2 added `map.restore` and `map.purge` for the admin maps panel (migration 0014).
- `MapEventPatch<K>` — the payload for kind `K` minus `kind`/`eventId`; the body a mutation's `mutate()` returns.

### Schemas

- `envelopeSchema` — raw frame `{ task: <any task>, load: unknown }`. Use to peek at `task` before per-task validation.
- Control-plane loads (firm): `subscribeLoadSchema` / `unsubscribeLoadSchema` (`{ mapIds: number[] }`), `healthCheckLoadSchema` (`{ ts, ok?, listeners? }`), `mapDeletedLoadSchema` (`{ mapId }`), `characterLogoutLoadSchema` (`{ characterIds }`), `mapAccessLoadSchema` (`{ mapId, characterIds }`).
- `mapEventPayloadSchema` — `z.discriminatedUnion('kind', …)` over the 14 event kinds. Every variant is `{ kind, eventId, ...patch }`: `system.added`/`connection.create`/`signature.create`/`map.create` carry the full body (system body mirrors `MapSystemNode` including `rallyAt`; edge mirrors `MapConnectionEdge` including `eolAt`/`createdAt`; signature body includes `createdAt`/`updatedAt` so the panel can display timestamps); `*.updated`/`*.update` carry `{ id, ...partial }` (`signature.update` includes `updatedAt`); `*.removed`/`*.delete`/`map.restore`/`map.purge` carry `{ id }`. Timestamps (`rallyAt`, `eolAt`, `createdAt`, `updatedAt`, `expiresAt`, `deletedAt`) are ISO strings. `map.purge` is emitted *inside* the purge transaction before the `ap_map` DELETE; pg_notify buffers the message until COMMIT, so subscribers receive it even though the source `ap_map_event` row is cascaded out.
- `mapUpdateLoadSchema` (`{ mapId, kind?, data?: MapEventPayload }`) — `bus.ts` builds `{ mapId, kind, data }` from the notify payload.
- Other data-bearing loads (forward-declared): `mapConnectionAccessLoadSchema` (`{ mapId, data? }`), `logDataLoadSchema` (`{ mapId, data? }`).
- `characterUpdateLoadSchema` — `{ characterId, characterName, online, systemId, shipTypeId, shipTypeName, shipName, locationAt }`. `characterName`, `shipTypeName`, and `shipName` are resolved server-side by the location-poll (Stage 12 / Stage 13 presence-badge) so the client renders the hover panel without a separate roster lookup; `shipTypeName` is null when `shipTypeId` is null, and `shipName` (the pilot's custom hull name from `ap_character.last_ship_name`) is null before the first online tick. The schema is exposed publicly because the client presence-context re-uses it to parse incoming envelopes.
- `systemNotificationLoadSchema` — `{ mapId, systemId, kind: 'killmail', killmail: { killmailId, shipTypeId, totalValue, href } }`. Stage 17.8 follow-up: a transient server-observed system event (a zKillboard kill in an on-map system). Like `characterUpdate`, broadcast by direct `pg_notify` bypassing `ap_map_event` (`src/lib/integrations/zkbFeed.ts`); the bus discriminates on the top-level `task`. `systemId` is the EVE solar-system id; `kind` is the (extensible) notification flavour, with the client owning the visual treatment (`underglowPresets.ts`). Exposed publicly so the bus and the client bridge both parse it.
- `serverToClientMessageSchema` — `z.discriminatedUnion('task', …)` over the nine server tasks (envelope + typed load).
- `clientToServerMessageSchema` — discriminated union over `subscribe` / `unsubscribe`.

### Notes
- Payload shapes are derived from the rebuild's operational need, not legacy `pathfinder_websocket` shapes.
- Adding a task name requires updating the spec (CLAUDE.md "Realtime").
