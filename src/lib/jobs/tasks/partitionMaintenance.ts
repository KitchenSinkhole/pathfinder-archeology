import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 11.5. Daily `partman.run_maintenance(p_analyze := false)` keeping the
 * partitioned tables happy:
 *
 *   - `ap_map_event` (monthly partitions, no retention) — pre-creates upcoming
 *     month partitions per the `premake` config so the next inserter doesn't
 *     stall on a missing range.
 *   - `ap_system_stats` (daily partitions, 60-day retention via migration
 *     0008) — same premake pre-creation, plus detaches+drops partitions whose
 *     range is older than the retention window.
 *
 * Cron slot `'5 4 * * *'` (04:05 UTC) is well outside the 11:00 EVE downtime
 * window and avoids the :00/:15/:30 contention with the other Stage-11 jobs.
 * Calling `run_maintenance` with no parent argument runs maintenance across
 * every row in `partman.part_config`; we keep the call boundary that simple so
 * future partitioned tables (sov, intel) are picked up automatically when their
 * own migration adds a `part_config` row.
 */

const NAME = 'partition-maintenance';

async function maintain(): Promise<{ durationMs: number }> {
  const started = Date.now();
  await db.execute(sql`SELECT partman.run_maintenance(p_analyze := false)`);
  return { durationMs: Date.now() - started };
}

export const partitionMaintenance: JobModule = {
  name: NAME,
  cron: '5 4 * * *',
  run: withInstrumentation(NAME, maintain),
};
