import { z } from 'zod';

/**
 * `getCharacterLocation` → `get_characters_character_id_location`. The pilot's
 * current solar system, plus an optional docked station/structure id. Only
 * `solar_system_id` is guaranteed; `station_id`/`structure_id` are present only
 * when docked (mutually exclusive in practice). Shape per `docs/ESI/swagger.json`.
 */
export const locationSchema = z.object({
  solar_system_id: z.number().int(),
  station_id: z.number().int().optional(),
  structure_id: z.number().int().optional(),
});

export type EsiLocation = z.infer<typeof locationSchema>;
