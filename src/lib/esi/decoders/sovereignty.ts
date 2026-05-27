import { z } from 'zod';

export const sovereigntyMapSchema = z.array(
  z.object({
    system_id: z.number().int(),
    faction_id: z.number().int().optional(),
    alliance_id: z.number().int().optional(),
    corporation_id: z.number().int().optional(),
  }),
);

export const factionWarSystemsSchema = z.array(
  z.object({
    solar_system_id: z.number().int(),
    owner_faction_id: z.number().int().optional(),
    occupier_faction_id: z.number().int().optional(),
    contested: z.string().nullable().optional(),
    victory_points: z.number().int().optional(),
    victory_points_threshold: z.number().int().optional(),
  }),
);

export type EsiSovereigntyMap = z.infer<typeof sovereigntyMapSchema>;
export type EsiFactionWarSystems = z.infer<typeof factionWarSystemsSchema>;
