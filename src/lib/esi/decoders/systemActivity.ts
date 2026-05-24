import { z } from 'zod';

/**
 * `getUniverseJumps` → `get_universe_system_jumps`. Array of `{ system_id,
 * ship_jumps }` for the hour ending at the response's `Last-Modified` header.
 * ESI explicitly excludes wormhole systems and systems with zero jumps.
 *
 * `getUniverseKills` → `get_universe_system_kills`. Array of `{ system_id,
 * ship_kills, pod_kills, npc_kills }` for the same hourly window.
 *
 * Both feed the Stage 11.3 stats-refresh job, which upserts into
 * `ap_system_stats`. Schemas per `docs/ESI/swagger.json`.
 */

export const universeSystemJumpsSchema = z.array(
  z.object({
    system_id: z.number().int(),
    ship_jumps: z.number().int().nonnegative(),
  }),
);

export type EsiUniverseSystemJumps = z.infer<typeof universeSystemJumpsSchema>;

export const universeSystemKillsSchema = z.array(
  z.object({
    system_id: z.number().int(),
    ship_kills: z.number().int().nonnegative(),
    pod_kills: z.number().int().nonnegative(),
    npc_kills: z.number().int().nonnegative(),
  }),
);

export type EsiUniverseSystemKills = z.infer<typeof universeSystemKillsSchema>;
