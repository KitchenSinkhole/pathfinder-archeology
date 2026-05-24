// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { desc, eq } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { db, pool } from '@/db/client';
import { apJobRun } from '@/db/schema';
import { structureResolve } from '@/lib/jobs/tasks/structureResolve';

/**
 * Stage 11.6 gate (sub-stage plan):
 *   "The deferred-stub marker is visible in `ap_job_run.notes` for
 *    `structure-resolve` so Stage 17 has a clear signpost."
 *
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';
const FAKE_HELPERS = {} as unknown as JobHelpers;

describe.skipIf(!run)('Stage 11.6 structure-resolve stub (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await db.delete(apJobRun).where(eq(apJobRun.name, 'structure-resolve'));
  });

  afterAll(async () => {
    await db.delete(apJobRun).where(eq(apJobRun.name, 'structure-resolve'));
    await pool.end();
  });

  it('records a success row tagged { deferred: "stage-17" } in ap_job_run.notes', async () => {
    await structureResolve.run(null, FAKE_HELPERS);

    const [row] = await db
      .select()
      .from(apJobRun)
      .where(eq(apJobRun.name, 'structure-resolve'))
      .orderBy(desc(apJobRun.startedAt))
      .limit(1);

    expect(row).toBeDefined();
    expect(row!.success).toBe(true);
    expect(row!.errorText).toBeNull();
    expect(row!.notes).toEqual({ deferred: 'stage-17' });
  });
});
