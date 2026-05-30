## decoders/index.ts

**Purpose:** Barrel for ESI response decoders - Zod schemas matching swagger 200-response shapes. The client parses every response through one so ESI schema drift fails loudly.
**File:** `src/lib/esi/decoders/index.ts`

---

### Re-exports
- `statusSchema` / `EsiStatus` (`status.ts`) - `getStatus`.
- `locationSchema` / `EsiLocation` (`location.ts`) - `getCharacterLocation`.
- `routeSchema` / `EsiRoute` (`route.ts`) - `getRoute`.
- `universeSystemJumpsSchema` / `EsiUniverseSystemJumps` (`systemActivity.ts`) - `getUniverseJumps`.
- `universeSystemKillsSchema` / `EsiUniverseSystemKills` (`systemActivity.ts`) - `getUniverseKills`.
- `characterOnlineSchema` / `EsiCharacterOnline` (`online.ts`) - `getCharacterOnline`.
- `characterShipSchema` / `EsiCharacterShip` (`ship.ts`) - `getCharacterShip`.
- `sovereigntyMapSchema` / `EsiSovereigntyMap` (`sovereignty.ts`) - `getSovereigntyMap`.
- `factionWarSystemsSchema` / `EsiFactionWarSystems` (`sovereignty.ts`) - `getFactionWarSystems`.
- `killmailSchema` / `EsiKillmail` (`killmail.ts`) - `getKillmail`.
- `universeNamesSchema` / `EsiUniverseNames` (`universeNames.ts`) - `getUniverseNames`.
