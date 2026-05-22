## decoders/index.ts

**Purpose:** Barrel for ESI response decoders — Zod schemas matching swagger 200-response shapes. The client parses every response through one so ESI schema drift fails loudly.
**File:** `src/lib/esi/decoders/index.ts`

Stage 4 seeds the substrate set only; consuming stages add their own decoders here.

---

### Re-exports
- `statusSchema` / `EsiStatus` (`status.ts`) — `getStatus` (`get_status`): `{ players, server_version, start_time, vip? }`.
- `locationSchema` / `EsiLocation` (`location.ts`) — `getCharacterLocation`: `{ solar_system_id, station_id?, structure_id? }`.
- `routeSchema` / `EsiRoute` (`route.ts`) — `getRoute`: `number[]` of solar-system ids, origin→destination.
