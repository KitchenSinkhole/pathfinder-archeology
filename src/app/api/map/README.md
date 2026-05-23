# `/api/map` — Map Mutation Pathways

This directory implements the **high-frequency JSON API** half of the canonical mutation pathway (CLAUDE.md §"Mutation pathways"). The low-frequency half lives in `src/app/(app)/actions/map.ts` (Server Actions).

## Design contract

Every route in this tree obeys these invariants:

1. **One `ap_map_event` per call.** Every mutation is routed through `commitMapEvent` (in `src/lib/map/mutations/core.ts`), which opens a single transaction, performs the row write, inserts exactly one `ap_map_event`, and returns. No route writes directly to the DB or fires `pg_notify` itself.

2. **WebSocket is broadcast-only.** Clients never mutate over the WebSocket. All mutations go through Server Actions or these routes.

3. **`{ ok, data, eventId }` response shape.** Every mutation route returns this JSON body (HTTP 200 on success, 400 on mutation-layer failure). Error responses before the mutation layer (401, 404, 400 for invalid input) also use `{ ok: false, error: string }`.

4. **Session required.** All routes call `getSession()` and return 401 if no session exists.

5. **Map guard.** All routes call `guardMap()` to confirm the map exists and is not soft-deleted before proceeding.

6. **INTERIM ACCESS (→ Stage 15).** Any logged-in character may call any route. The per-map rights model (`ap_map_access`) is added in Stage 15.

## Routes

| Method | Path | Helper | Event kind |
|--------|------|--------|-----------|
| POST | `/api/map/[mapId]/systems` | `addSystem` | `system.added` |
| PATCH | `/api/map/[mapId]/systems/[systemId]` | `updateSystem` | `system.updated` |
| DELETE | `/api/map/[mapId]/systems/[systemId]` | `removeSystem` | `system.removed` |
| POST | `/api/map/[mapId]/connections` | `createConnection` | `connection.create` |
| PATCH | `/api/map/[mapId]/connections/[connId]` | `updateConnection` | `connection.update` |
| DELETE | `/api/map/[mapId]/connections/[connId]` | `deleteConnection` | `connection.delete` |
| POST | `/api/map/[mapId]/signatures` | `createSignature` | `signature.create` |
| PATCH | `/api/map/[mapId]/signatures/[sigId]` | `updateSignature` | `signature.update` |
| DELETE | `/api/map/[mapId]/signatures/[sigId]` | `deleteSignature` | `signature.delete` |
| GET | `/api/map/[mapId]/wormhole-types?systemId=` | `wormholeTypesForSystem` | (read-only) |

`[systemId]` = `ap_map_system.id` (the xyflow node id, not the EVE solar-system id).  
`[sigId]` = `ap_map_signature.id` (the DB row id, not the in-game 3-char sig code).

## Realtime propagation

After each mutation the `tg_map_event_notify` Postgres trigger fires `pg_notify('map:<mapId>', payload)`. The WS server's LISTEN handler picks this up and fans the `mapUpdate` envelope to all subscribed sockets. The initiating client dedupes by the `eventId` in the payload — it applies the change optimistically on call and drops the realtime echo when the `eventId` matches.

## Shared helpers

- `src/app/api/map/utils.ts` — `parseBigInt`, `guardMap`.
- `src/lib/map/mutations/` — one file per entity: `core.ts`, `systems.ts`, `connections.ts`, `signatures.ts`.
- `src/lib/map/wormholeTypes.ts` — `wormholeTypesForSystem`, `staticMatchForConnection`.
