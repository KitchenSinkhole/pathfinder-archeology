import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 11.4. Hourly refresh of the `ap_activity_rollup` materialized view
 * (`src/db/views/activity_rollup.sql`). Runs at `:15 past` to stay clear of
 * the `:30` stats-refresh slot — the two are the only ESI-shaped contention
 * points in the cron schedule and don't need to share a queue slot.
 *
 * `REFRESH ... CONCURRENTLY` requires the MV to have a unique index covering
 * every row (`ap_activity_rollup_pk_idx`); it takes a row-level lock instead of
 * an `ACCESS EXCLUSIVE` table lock, so admin reads of the rollup stay
 * available while the refresh runs. SPEC §6.5.
 *
 * Cold-start contract: the MV is created `WITH NO DATA` (migration 0007), so
 * the very first invocation populates it. The first run may take longer than
 * subsequent ones — that's recorded in `ap_job_run.notes.durationMs`.
 */

const NAME = 'activity-rollup-refresh';

async function refresh(): Promise<{ durationMs: number }> {
  const started = Date.now();
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY "ap_activity_rollup"`);
  return { durationMs: Date.now() - started };
}

export const activityRollupRefresh: JobModule = {
  name: NAME,
  cron: '15 * * * *',
  run: withInstrumentation(NAME, refresh),
};
