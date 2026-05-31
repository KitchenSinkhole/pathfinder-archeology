import { z } from 'zod';

/**
 * `search` → `get_characters_character_id_search`. The character search endpoint
 * returns one id array per requested category (`corporation`, `alliance`, …),
 * each capped at 500 by ESI. Only the categories actually requested are present,
 * so every field is optional; the structure dialog asks for `corporation` only.
 *
 * Requires the `esi-search.search_structures.v1` scope on the calling character
 * (the endpoint gates all categories behind that one scope).
 */
export const searchResultSchema = z.object({
  corporation: z.array(z.number().int()).optional(),
  alliance: z.array(z.number().int()).optional(),
});

export type EsiSearchResult = z.infer<typeof searchResultSchema>;
