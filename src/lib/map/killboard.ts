import 'server-only';
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { universeType } from '@/db/schema';
import { ccpImageUrl } from '@/lib/integrations/links';
import { recentKillsForSystem, type RecentKillSummary } from '@/lib/integrations/zkb';
import { esiCall } from '@/lib/esi/client';
import { killmailSchema, universeNamesSchema, type EsiKillmail } from '@/lib/esi/decoders';

/** A recent kill enriched with victim + ship display data for the sidebar feed. */
export type KillboardKill = RecentKillSummary & {
  killmailTime: string | null;
  shipTypeId: number | null;
  shipName: string | null;
  shipIcon: string | null;
  victimName: string | null;
  victimIcon: string | null;
  attackers: number | null;
};

/** Fetch one ESI killmail, returning null on any failure so one bad row can't sink the feed. */
async function fetchKillmail(killmailId: number, hash: string): Promise<EsiKillmail | null> {
  try {
    return await esiCall('getKillmail', {
      schema: killmailSchema,
      pathParams: { killmail_id: killmailId, killmail_hash: hash },
    });
  } catch {
    return null;
  }
}

/** Resolve a batch of character/corporation ids to display names, best-effort. */
async function resolveNames(ids: number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  if (ids.length === 0) return names;
  try {
    const rows = await esiCall('getUniverseNames', {
      schema: universeNamesSchema,
      body: ids,
    });
    for (const r of rows) names.set(r.id, r.name);
  } catch {
    // Name resolution is decorative — degrade to ids rather than failing the feed.
  }
  return names;
}

/**
 * Recent zKillboard kills for a system, enriched into renderable rows.
 *
 * zKillboard's per-system list endpoint returns only `{ killmailId, hash,
 * totalValue }`, so the victim, their ship, the kill time, and the attacker
 * count are pulled from the full ESI killmail (one `getKillmail` per row, in
 * parallel; individual failures degrade that row rather than the feed). Victim
 * names come from a single batched `getUniverseNames`; ship names from one
 * `universe_type` query. Propagates the zkb client's `ZkbRateLimitError` /
 * `ZkbHttpError` so the route can map them to the right status.
 */
export async function killboardForSystem(
  systemId: number,
  limit: number,
): Promise<KillboardKill[]> {
  const kills = await recentKillsForSystem(systemId, limit);

  const killmails = await Promise.all(
    kills.map((k) => (k.hash ? fetchKillmail(k.killmailId, k.hash) : Promise.resolve(null))),
  );

  const shipTypeIds = new Set<number>();
  const victimIds = new Set<number>();
  for (const km of killmails) {
    if (km?.victim.ship_type_id != null) shipTypeIds.add(km.victim.ship_type_id);
    const victimId = km?.victim.character_id ?? km?.victim.corporation_id;
    if (victimId != null) victimIds.add(victimId);
  }

  const shipNames = new Map<number, string>();
  if (shipTypeIds.size > 0) {
    const rows = await db
      .select({ id: universeType.id, name: universeType.name })
      .from(universeType)
      .where(inArray(universeType.id, [...shipTypeIds]));
    for (const r of rows) shipNames.set(r.id, r.name);
  }

  const victimNames = await resolveNames([...victimIds]);

  return kills.map((k, i) => {
    const km = killmails[i];
    const shipTypeId = km?.victim.ship_type_id ?? null;
    const characterId = km?.victim.character_id ?? null;
    const corporationId = km?.victim.corporation_id ?? null;
    const victimId = characterId ?? corporationId;
    return {
      ...k,
      killmailTime: km?.killmail_time ?? null,
      shipTypeId,
      shipName: shipTypeId != null ? (shipNames.get(shipTypeId) ?? null) : null,
      shipIcon: shipTypeId != null ? ccpImageUrl('types', shipTypeId, 'icon', 64) : null,
      victimName: victimId != null ? (victimNames.get(victimId) ?? null) : null,
      victimIcon:
        characterId != null
          ? ccpImageUrl('characters', characterId, 'portrait', 64)
          : corporationId != null
            ? ccpImageUrl('corporations', corporationId, 'logo', 64)
            : null,
      attackers: km ? km.attackers.length : null,
    };
  });
}
