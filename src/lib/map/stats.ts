import 'server-only';
import { and, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apSystemStats } from '@/db/schema';

/** Rolling 24h activity totals for a system. */
export type SystemStatsSummary = {
  jumps: number;
  shipKills: number;
  podKills: number;
  factionKills: number;
};

/**
 * Rolling 24h (`hour_bucket > now() - interval '24 hours'`) summed stats per
 * system, keyed by EVE solar-system id. Systems with no rows are absent from the
 * result — the kill-stats module renders a zero state for them.
 *
 * `ap_system_stats` is empty until the Stage 11 refresh job populates it, so this
 * currently returns an empty record for any input; the read path is genuine.
 */
export async function statsForSystems(
  systemIds: number[],
): Promise<Record<number, SystemStatsSummary>> {
  const result: Record<number, SystemStatsSummary> = {};
  if (systemIds.length === 0) return result;

  const rows = await db
    .select({
      systemId: apSystemStats.systemId,
      jumps: sql<number>`coalesce(sum(${apSystemStats.jumps}), 0)::int`,
      shipKills: sql<number>`coalesce(sum(${apSystemStats.shipKills}), 0)::int`,
      podKills: sql<number>`coalesce(sum(${apSystemStats.podKills}), 0)::int`,
      factionKills: sql<number>`coalesce(sum(${apSystemStats.factionKills}), 0)::int`,
    })
    .from(apSystemStats)
    .where(
      and(
        inArray(apSystemStats.systemId, systemIds),
        gt(apSystemStats.hourBucket, sql`now() - interval '24 hours'`),
      ),
    )
    .groupBy(apSystemStats.systemId);

  for (const r of rows) {
    result[r.systemId] = {
      jumps: r.jumps,
      shipKills: r.shipKills,
      podKills: r.podKills,
      factionKills: r.factionKills,
    };
  }
  return result;
}
