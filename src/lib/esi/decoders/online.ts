import { z } from 'zod';

/**
 * `getCharacterOnline` → `get_characters_character_id_online`. Whether the
 * character is currently logged in. Required field: `online`. The login/logout
 * timestamps and the lifetime `logins` counter are present when CCP knows
 * them (so they are optional here per the swagger schema).
 *
 * Stage 12.1 location-poll reads this every tick to decide between the online
 * and offline polling cadences.
 */
export const characterOnlineSchema = z.object({
  online: z.boolean(),
  last_login: z.string().optional(),
  last_logout: z.string().optional(),
  logins: z.number().int().nonnegative().optional(),
});

export type EsiCharacterOnline = z.infer<typeof characterOnlineSchema>;
