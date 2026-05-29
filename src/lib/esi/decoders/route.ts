import { z } from 'zod';

/**
 * `getRoute` → `get_route_origin_destination`. An ordered list of solar-system
 * ids from origin to destination (inclusive). Shape per `src/lib/esi/swagger.json`.
 */
export const routeSchema = z.array(z.number().int());

export type EsiRoute = z.infer<typeof routeSchema>;
