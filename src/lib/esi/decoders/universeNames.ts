import { z } from 'zod';

/**
 * `getUniverseNames` → `post_universe_names`. Resolves a batch of EVE ids
 * (characters, corporations, alliances, types, …) to display names in one call.
 * The killboard uses it to name kill victims, whose character/corporation ids
 * are not present in any `universe_*` table.
 *
 * `category` is a CCP enum (`character`, `corporation`, `alliance`,
 * `inventory_type`, …) but is decoded as a plain string — consumers branch on
 * the values they care about and the set is not load-bearing here.
 */
export const universeNamesSchema = z.array(
  z.object({
    id: z.number().int(),
    name: z.string(),
    category: z.string(),
  }),
);

export type EsiUniverseNames = z.infer<typeof universeNamesSchema>;
