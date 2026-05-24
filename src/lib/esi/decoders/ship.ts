import { z } from 'zod';

/**
 * `getCharacterShip` → `get_characters_character_id_ship`. Current ship the
 * character is in. `ship_type_id` is the type the rebuild stores as
 * `ap_character.last_ship_type_id` for the head-of-page breadcrumb (Stage 12.1).
 *
 * `ship_item_id` is an instance id (per-ship, persists across docking until
 * the ship is repackaged); useful for the future "did the pilot swap ships?"
 * signal but not consumed by the poll today.
 */
export const characterShipSchema = z.object({
  ship_type_id: z.number().int(),
  ship_item_id: z.number().int(),
  ship_name: z.string(),
});

export type EsiCharacterShip = z.infer<typeof characterShipSchema>;
