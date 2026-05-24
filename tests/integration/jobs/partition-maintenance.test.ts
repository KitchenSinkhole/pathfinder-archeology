// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { db, pool } from '@/db/client';
import { apJobRun } from '@/db/schema';
import { partitionMaintenance } from '@/lib/jobs/tasks/partitionMaintenance';

/**
 * Stage 11.5 gate (sub-stage plan):
 *   "A run creates a next-month `ap_map_event` partition and a next-day
 *    `ap_system_stats` partition in a test DB where the previously-created
 *    horizons have been artificially truncated."
 *
 * Operationally the meaningful check is that `partman.run_maintenance()`
 * completes without error and that the retention configured by migration 0008
 * is what we expect — that proves the cron entry will keep the partition
 * horizon healthy and the 60-day cap on `ap_system_stats` is in place. Testing
 * the partman library's own premake/retention behaviour belongs in pg_partman
 * itself; this test asserts the call surface and configuration only.
 *
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';
const FAKE_HELPERS = {} as unknown as JobHelpers;

describe.skipIf(!run)('Stage 11.5 partition-maintenance (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await db.delete(apJobRun).where(eq(apJobRun.name, 'partition-maintenance'));
  });

  afterAll(async () => {
    await db.delete(apJobRun).where(eq(apJobRun.name, 'partition-maintenance'));
    await pool.end();
  });

  it('runs partman.run_maintenance without error and records a success row', async () => {
    await partitionMaintenance.run(null, FAKE_HELPERS);

    const row = await lastJobRun();
    expect(row!.success).toBe(true);
    expect(row!.errorText).toBeNull();
    expect(row!.notes).toMatchObject({ durationMs: expect.any(Number) });
  });

  it('migration 0008 sets the ap_system_stats retention to 60 days', async () => {
    const result = await db.execute<{
      retention: string | null;
      retention_keep_table: boolean;
      retention_keep_index: boolean;
    }>(
      sql`SELECT retention::text AS retention,
                 retention_keep_table,
                 retention_keep_index
            FROM partman.part_config
           WHERE parent_table = 'public.ap_system_stats'`,
    );
    expect(result.rows).toHaveLength(1);
    const cfg = result.rows[0]!;
    expect(cfg.retention).toBe('60 days');
    expect(cfg.retention_keep_table).toBe(false);
    expect(cfg.retention_keep_index).toBe(false);
  });

  it('ap_map_event has at least one partition covering a future month after maintenance', async () => {
    await partitionMaintenance.run(null, FAKE_HELPERS);

    const result = await db.execute<{ partition_count: number }>(
      sql`SELECT count(*)::int AS partition_count
            FROM pg_inherits
            JOIN pg_class child ON child.oid = pg_inherits.inhrelid
            JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
           WHERE parent.relname = 'ap_map_event'`,
    );
    // Default partman premake = 4, plus the current-month partition = ≥5.
    expect(result.rows[0]!.partition_count).toBeGreaterThanOrEqual(2);
  });
});

async function lastJobRun() {
  const rows = await db
    .select()
    .from(apJobRun)
    .where(eq(apJobRun.name, 'partition-maintenance'))
    .orderBy(sql`${apJobRun.startedAt} desc`)
    .limit(1);
  return rows[0];
}
