import { inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  universeFactionWarSystem,
  universeSovereigntyMap,
  universeSystem,
} from '@/db/schema';
import { esiCall } from '@/lib/esi/client';
import { factionWarSystemsSchema, sovereigntyMapSchema } from '@/lib/esi/decoders';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

const NAME = 'sov-fw-refresh';

function maybeBigInt(value: number | undefined): bigint | null {
  return value === undefined ? null : BigInt(value);
}

async function refresh(): Promise<{
  fetchedSov: number;
  fetchedFw: number;
  upsertedSov: number;
  upsertedFw: number;
  deletedSov: number;
  deletedFw: number;
  skippedNonKspace: number;
}> {
  const [sov, fw] = await Promise.all([
    esiCall('getSovereigntyMap', { schema: sovereigntyMapSchema }),
    esiCall('getFactionWarSystems', { schema: factionWarSystemsSchema }),
  ]);

  const candidateIds = Array.from(
    new Set([
      ...sov.map((r) => r.system_id),
      ...fw.map((r) => r.solar_system_id),
    ]),
  );
  const known = candidateIds.length
    ? await db
        .select({ id: universeSystem.id, security: universeSystem.security })
        .from(universeSystem)
        .where(inArray(universeSystem.id, candidateIds))
    : [];
  const kspace = new Set(
    known.filter((s) => !s.security?.startsWith('C')).map((s) => s.id),
  );
  const skippedNonKspace = candidateIds.length - kspace.size;

  const sovValues = sov
    .filter((r) => kspace.has(r.system_id))
    .map((r) => ({
      systemId: r.system_id,
      factionId: maybeBigInt(r.faction_id),
      allianceId: maybeBigInt(r.alliance_id),
      corporationId: maybeBigInt(r.corporation_id),
    }));
  const fwValues = fw
    .filter((r) => kspace.has(r.solar_system_id))
    .map((r) => ({
      systemId: r.solar_system_id,
      ownerFactionId: maybeBigInt(r.owner_faction_id),
      occupierFactionId: maybeBigInt(r.occupier_faction_id),
      contested: r.contested ?? null,
      victoryPoints: r.victory_points ?? null,
      victoryPointsThreshold: r.victory_points_threshold ?? null,
    }));

  return await db.transaction(async (tx) => {
    if (sovValues.length > 0) {
      await tx
        .insert(universeSovereigntyMap)
        .values(sovValues)
        .onConflictDoUpdate({
          target: universeSovereigntyMap.systemId,
          set: {
            factionId: sql`excluded.faction_id`,
            allianceId: sql`excluded.alliance_id`,
            corporationId: sql`excluded.corporation_id`,
          },
        });
    }
    if (fwValues.length > 0) {
      await tx
        .insert(universeFactionWarSystem)
        .values(fwValues)
        .onConflictDoUpdate({
          target: universeFactionWarSystem.systemId,
          set: {
            ownerFactionId: sql`excluded.owner_faction_id`,
            occupierFactionId: sql`excluded.occupier_faction_id`,
            contested: sql`excluded.contested`,
            victoryPoints: sql`excluded.victory_points`,
            victoryPointsThreshold: sql`excluded.victory_points_threshold`,
          },
        });
    }

    const sovIds = sovValues.map((r) => r.systemId);
    const fwIds = fwValues.map((r) => r.systemId);
    const deletedSovRows = sovIds.length
      ? await tx
          .delete(universeSovereigntyMap)
          .where(notInArray(universeSovereigntyMap.systemId, sovIds))
          .returning({ systemId: universeSovereigntyMap.systemId })
      : await tx
          .delete(universeSovereigntyMap)
          .returning({ systemId: universeSovereigntyMap.systemId });
    const deletedFwRows = fwIds.length
      ? await tx
          .delete(universeFactionWarSystem)
          .where(notInArray(universeFactionWarSystem.systemId, fwIds))
          .returning({ systemId: universeFactionWarSystem.systemId })
      : await tx
          .delete(universeFactionWarSystem)
          .returning({ systemId: universeFactionWarSystem.systemId });

    return {
      fetchedSov: sov.length,
      fetchedFw: fw.length,
      upsertedSov: sovValues.length,
      upsertedFw: fwValues.length,
      deletedSov: deletedSovRows.length,
      deletedFw: deletedFwRows.length,
      skippedNonKspace,
    };
  });
}

export const sovFwRefresh: JobModule = {
  name: NAME,
  cron: '30 * * * *',
  run: withInstrumentation(NAME, refresh),
};
