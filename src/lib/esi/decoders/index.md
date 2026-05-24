## decoders/index.ts

**Purpose:** Barrel for ESI response decoders — Zod schemas matching swagger 200-response shapes. The client parses every response through one so ESI schema drift fails loudly.
**File:** `src/lib/esi/decoders/index.ts`

Stage 4 seeds the substrate set only; consuming stages add their own decoders here.

---

### Re-exports
- `statusSchema` / `EsiStatus` (`status.ts`) — `getStatus` (`get_status`): `{ players, server_version, start_time, vip? }`.
- `locationSchema` / `EsiLocation` (`location.ts`) — `getCharacterLocation`: `{ solar_system_id, station_id?, structure_id? }`.
- `routeSchema` / `EsiRoute` (`route.ts`) — `getRoute`: `number[]` of solar-system ids, origin→destination.
- `universeSystemJumpsSchema` / `EsiUniverseSystemJumps` (`systemActivity.ts`) — `getUniverseJumps` (`get_universe_system_jumps`): `[{ system_id, ship_jumps }]` per hourly window (ESI excludes WH space and zero-jump systems).
- `universeSystemKillsSchema` / `EsiUniverseSystemKills` (`systemActivity.ts`) — `getUniverseKills` (`get_universe_system_kills`): `[{ system_id, ship_kills, pod_kills, npc_kills }]` per hourly window. Stage 11.3 stats refresh.
- `characterOnlineSchema` / `EsiCharacterOnline` (`online.ts`) — `getCharacterOnline`: `{ online, last_login?, last_logout?, logins? }`. Stage 12.1 location-poll cadence gate.
- `characterShipSchema` / `EsiCharacterShip` (`ship.ts`) — `getCharacterShip`: `{ ship_type_id, ship_item_id, ship_name }`. Stage 12.1 location-poll → `ap_character.last_ship_type_id`.
