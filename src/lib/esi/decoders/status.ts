import { z } from 'zod';

/**
 * `getStatus` → `get_status`. EVE server status (player count, version, VIP).
 * Shape per `docs/ESI/swagger.json`. `vip` is omitted when the server is not in
 * VIP mode, so it is optional.
 */
export const statusSchema = z.object({
  players: z.number().int().nonnegative(),
  server_version: z.string(),
  start_time: z.string(),
  vip: z.boolean().optional(),
});

export type EsiStatus = z.infer<typeof statusSchema>;
