import 'server-only';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apSystemStats } from '@/db/schema';

/** Rolling 24h activity totals for a system. */
export type SystemStatsSummary = {
  jumps: number;
  shipKills: number;
  podKills: number;
  factionKills: number;
};

/** Time window + bucket granularity for the system graph (Stage 17.8). */
export type GraphRange = '24h' | '7d' | '30d';

/** One bucketed point in a system-graph series; `bucket` is an ISO timestamp. */
export type SystemStatsPoint = { bucket: string } & SystemStatsSummary;

const RANGE_CONFIG: Record<GraphRange, { interval: string; unit: 'hour' | 'day' }> = {
  '24h': { interval: '24 hours', unit: 'hour' },
  '7d': { interval: '7 days', unit: 'day' },
  '30d': { interval: '30 days', unit: 'day' },
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

/**
 * Bucketed activity time-series for one system over `range`, ordered ascending
 * by bucket. `24h` returns hourly buckets; `7d`/`30d` sum into daily buckets.
 * Sparse — buckets with no recorded activity are absent (the graph module fills
 * gaps client-side). K-space only in practice, since the refresh job only writes
 * K-space rows.
 */
export async function systemStatsSeries(
  systemId: number,
  range: GraphRange,
): Promise<SystemStatsPoint[]> {
  const { interval, unit } = RANGE_CONFIG[range];
  // `unit` is inlined as a literal (not a bound param) so the expression is
  // byte-identical across SELECT/GROUP BY/ORDER BY. A parameterized $n renders
  // distinct placeholders per clause, which Postgres won't match for grouping.
  const bucket = sql<Date>`date_trunc('${sql.raw(unit)}', ${apSystemStats.hourBucket})`;
  const rows = await db
    .select({
      bucket,
      jumps: sql<number>`coalesce(sum(${apSystemStats.jumps}), 0)::int`,
      shipKills: sql<number>`coalesce(sum(${apSystemStats.shipKills}), 0)::int`,
      podKills: sql<number>`coalesce(sum(${apSystemStats.podKills}), 0)::int`,
      factionKills: sql<number>`coalesce(sum(${apSystemStats.factionKills}), 0)::int`,
    })
    .from(apSystemStats)
    .where(
      and(
        eq(apSystemStats.systemId, systemId),
        gt(apSystemStats.hourBucket, sql`now() - ${interval}::interval`),
      ),
    )
    .groupBy(bucket)
    .orderBy(bucket);

  return rows.map((r) => ({
    bucket: new Date(r.bucket).toISOString(),
    jumps: r.jumps,
    shipKills: r.shipKills,
    podKills: r.podKills,
    factionKills: r.factionKills,
  }));
}
