import { inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apSystemStats, universeSystem } from '@/db/schema';
import { esiCall } from '@/lib/esi/client';
import { universeSystemJumpsSchema, universeSystemKillsSchema } from '@/lib/esi/decoders';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 11.3. Per-system stats refresh cron. Fetches `getUniverseJumps` and
 * `getUniverseKills` in parallel each hour, bucket-aligns them at the current
 * hour boundary (`date_trunc('hour', now())` in Postgres so we avoid Node↔PG
 * clock skew), and upserts one `ap_system_stats` row per system the ESI
 * payloads cover.
 *
 * **K-space only.** ESI itself excludes wormhole systems from these endpoints,
 * but we still filter `universe_system.security IN ('H','L','0.0')` defensively
 * — a stray ID outside that set is dropped rather than written. Abyssal/Pochven
 * are also excluded by this filter.
 *
 * **No retry logic.** A breaker-open or downtime error from `esiCall` is the
 * canonical "ESI is unavailable" signal; the throw propagates so
 * `withInstrumentation` records `ap_job_run.success = false` and graphile-worker
 * retries per its own policy.
 *
 * Replaces legacy `Cron\CcpSystemsUpdate::importSystemData`. The legacy
 * 24-column circular buffer is gone (SPEC §6.5); rolling 24h windows are now
 * `WHERE hour_bucket > now() - interval '24 hours'`.
 */

const NAME = 'system-stats-refresh';

type SystemCounts = {
  jumps: number;
  shipKills: number;
  podKills: number;
  factionKills: number;
};

async function refresh(): Promise<{
  fetchedJumps: number;
  fetchedKills: number;
  upserted: number;
  skippedNonKspace: number;
}> {
  const [jumps, kills] = await Promise.all([
    esiCall('getUniverseJumps', { schema: universeSystemJumpsSchema }),
    esiCall('getUniverseKills', { schema: universeSystemKillsSchema }),
  ]);

  const counts = new Map<number, SystemCounts>();
  for (const row of jumps) {
    counts.set(row.system_id, {
      jumps: row.ship_jumps,
      shipKills: 0,
      podKills: 0,
      factionKills: 0,
    });
  }
  for (const row of kills) {
    const existing = counts.get(row.system_id) ?? {
      jumps: 0,
      shipKills: 0,
      podKills: 0,
      factionKills: 0,
    };
    existing.shipKills = row.ship_kills;
    existing.podKills = row.pod_kills;
    existing.factionKills = row.npc_kills;
    counts.set(row.system_id, existing);
  }

  if (counts.size === 0) {
    return { fetchedJumps: jumps.length, fetchedKills: kills.length, upserted: 0, skippedNonKspace: 0 };
  }

  const candidateIds = Array.from(counts.keys());
  const kSpace = await db
    .select({ id: universeSystem.id, security: universeSystem.security })
    .from(universeSystem)
    .where(inArray(universeSystem.id, candidateIds));

  const allowed = new Set(
    kSpace.filter((s) => s.security === 'H' || s.security === 'L' || s.security === '0.0').map((s) => s.id),
  );
  const skippedNonKspace = candidateIds.length - allowed.size;

  const values: Array<{
    systemId: number;
    hourBucket: ReturnType<typeof sql>;
    jumps: number;
    shipKills: number;
    podKills: number;
    factionKills: number;
  }> = [];
  for (const [systemId, c] of counts) {
    if (!allowed.has(systemId)) continue;
    values.push({
      systemId,
      hourBucket: sql`date_trunc('hour', now())`,
      jumps: c.jumps,
      shipKills: c.shipKills,
      podKills: c.podKills,
      factionKills: c.factionKills,
    });
  }

  if (values.length > 0) {
    await db
      .insert(apSystemStats)
      .values(values)
      .onConflictDoUpdate({
        target: [apSystemStats.systemId, apSystemStats.hourBucket],
        set: {
          jumps: sql`excluded.jumps`,
          shipKills: sql`excluded.ship_kills`,
          podKills: sql`excluded.pod_kills`,
          factionKills: sql`excluded.faction_kills`,
        },
      });
  }

  return {
    fetchedJumps: jumps.length,
    fetchedKills: kills.length,
    upserted: values.length,
    skippedNonKspace,
  };
}

export const systemStatsRefresh: JobModule = {
  name: NAME,
  cron: '30 * * * *',
  run: withInstrumentation(NAME, refresh),
};
