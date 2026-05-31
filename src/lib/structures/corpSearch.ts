import 'server-only';
import { esiCall } from '@/lib/esi/client';
import { searchResultSchema, universeNamesSchema } from '@/lib/esi/decoders';
import { freshCachedCorporationNames, upsertCorporations } from './corporations';

/**
 * Corporation name search for the structure-intel owner picker. Backs the
 * autocomplete in `StructureFormDialog` so a structure's owner maps to a real
 * EVE corporation rather than free text.
 *
 * The character search endpoint (`search`, scope `esi-search.search_structures.v1`)
 * returns matching corp ids by name; names are then resolved from the
 * `universe_corporation` cache, falling back to `getUniverseNames` only for ids
 * not already cached (which are written back). The search runs under the
 * *requesting* character's token — any signed-in user has the scope after re-consent.
 */

export type CorpSearchResult = { id: number; name: string };

/** ESI rejects search terms shorter than this; mirror it to avoid a wasted call. */
const MIN_QUERY_LENGTH = 3;
/** Cap resolved names — the dropdown shows a short list and `post_universe_names` is one call. */
const MAX_RESULTS = 25;

/**
 * Search corporations by (partial) name. Returns `[]` for queries under
 * `MIN_QUERY_LENGTH` without hitting ESI. Throws the underlying ESI error
 * (breaker/http/token/decode) so the route can translate it; in particular a
 * 403 means the caller's token predates the search scope and they must
 * re-authenticate.
 *
 * Names come from the `universe_corporation` cache where fresh; only ids not
 * already cached cost a `getUniverseNames` call, and those are written back.
 * `strict` is left off so partial names match. Results are ordered prefix-first
 * then alphabetically so the typed corp surfaces near the top.
 */
export async function searchCorporations(
  query: string,
  characterId: bigint,
): Promise<CorpSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const hits = await esiCall('search', {
    schema: searchResultSchema,
    pathParams: { character_id: characterId },
    query: { categories: 'corporation', search: trimmed },
    characterId,
  });

  const ids = (hits.corporation ?? []).slice(0, MAX_RESULTS);
  if (ids.length === 0) return [];

  const names = await freshCachedCorporationNames(ids);
  const missing = ids.filter((id) => !names.has(id));
  if (missing.length > 0) {
    const resolved = (
      await esiCall('getUniverseNames', { schema: universeNamesSchema, body: missing })
    )
      .filter((n) => n.category === 'corporation')
      .map((n) => ({ id: n.id, name: n.name }));
    await upsertCorporations(resolved);
    for (const corp of resolved) names.set(corp.id, corp.name);
  }

  const lower = trimmed.toLowerCase();
  return ids
    .filter((id) => names.has(id))
    .map((id) => ({ id, name: names.get(id)! }))
    .sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
      return aPrefix - bPrefix || a.name.localeCompare(b.name);
    });
}
