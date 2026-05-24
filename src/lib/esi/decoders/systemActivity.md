## systemActivity.ts

**Purpose:** Zod decoders for the two ESI endpoints the Stage 11.3 per-system stats refresh job pulls each hour.
**File:** `src/lib/esi/decoders/systemActivity.ts`

---

### universeSystemJumpsSchema → EsiUniverseSystemJumps
`getUniverseJumps` (`get_universe_system_jumps`): array of `{ system_id, ship_jumps }`. ESI deliberately excludes wormhole systems and systems with zero jumps in the window. Cached server-side for ~3600s; the cron's `'30 * * * *'` cadence aligns with the publish boundary.

### universeSystemKillsSchema → EsiUniverseSystemKills
`getUniverseKills` (`get_universe_system_kills`): array of `{ system_id, ship_kills, pod_kills, npc_kills }` for the same hourly window. `npc_kills` is what the rebuild stores as `ap_system_stats.faction_kills` (legacy `system_kills_factions` naming preserved).
