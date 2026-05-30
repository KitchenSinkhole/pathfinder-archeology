import { z } from 'zod';

/**
 * `getKillmail` → `get_killmails_killmail_id_killmail_hash`. The full killmail
 * referenced by a zKillboard list entry (which only carries the id + hash).
 * Used by the system-killboard module to resolve the victim, their ship, the
 * kill time, and the number of attackers that zKillboard's list endpoint omits.
 *
 * The swagger schema is far wider (per-item loot, positions, faction ids, …);
 * only the fields the killboard renders are pulled out, the rest accepted
 * permissively.
 */
export const killmailSchema = z
  .object({
    killmail_id: z.number().int(),
    killmail_time: z.string(),
    solar_system_id: z.number().int(),
    victim: z
      .object({
        character_id: z.number().int().optional(),
        corporation_id: z.number().int().optional(),
        alliance_id: z.number().int().optional(),
        ship_type_id: z.number().int().optional(),
      })
      .loose(),
    attackers: z.array(z.unknown()),
  })
  .loose();

export type EsiKillmail = z.infer<typeof killmailSchema>;
