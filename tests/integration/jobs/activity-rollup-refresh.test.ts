// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { db, pool } from '@/db/client';
import { apJobRun, apMap, apMapEvent } from '@/db/schema';
import { activityRollupRefresh } from '@/lib/jobs/tasks/activityRollupRefresh';

/**
 * Stage 11.4 gate (sub-stage plan):
 *   "After seeding events, the job populates `ap_activity_rollup`; a second
 *    run after new events updates row counts without blocking reads."
 *
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';
const FAKE_HELPERS = {} as unknown as JobHelpers;

let mapId = 0n;

type RollupRow = {
  iso_year: number;
  iso_week: number;
  character_id: string;
  map_id: string;
  kind: string;
  event_count: number;
};

async function rollupRowsForMap(id: bigint): Promise<RollupRow[]> {
  const result = await db.execute<RollupRow>(
    sql`SELECT iso_year, iso_week, character_id, map_id, kind, event_count
        FROM ap_activity_rollup
        WHERE map_id = ${id}
        ORDER BY kind`,
  );
  return result.rows;
}

describe.skipIf(!run)('Stage 11.4 activity-rollup-refresh (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await db.delete(apJobRun).where(eq(apJobRun.name, 'activity-rollup-refresh'));
    await db.delete(apMap).where(sql`name like 'rollup-%'`);

    const [m] = await db
      .insert(apMap)
      .values({ scope: 'all', type: 'private', name: 'rollup-test-map' })
      .returning({ id: apMap.id });
    mapId = m!.id;
  });

  afterAll(async () => {
    await db.delete(apJobRun).where(eq(apJobRun.name, 'activity-rollup-refresh'));
    // Cascade clears ap_map_event for this map; the MV is left as-is (next
    // refresh would drop the now-orphaned rows).
    await db.delete(apMap).where(eq(apMap.id, mapId));
    await pool.end();
  });

  it('populates the rollup MV from ap_map_event rows on first run', async () => {
    await db.insert(apMapEvent).values([
      // Two system.added events from the same character.
      {
        mapId,
        characterId: null, // anonymous / character erased
        occurredAt: sql`now()`,
        kind: 'system.added',
        payload: { kind: 'system.added', eventId: 1 },
      },
      {
        mapId,
        characterId: null,
        occurredAt: sql`now()`,
        kind: 'system.added',
        payload: { kind: 'system.added', eventId: 2 },
      },
      // One connection.create event from same null character.
      {
        mapId,
        characterId: null,
        occurredAt: sql`now()`,
        kind: 'connection.create',
        payload: { kind: 'connection.create', eventId: 3 },
      },
    ]);

    await activityRollupRefresh.run(null, FAKE_HELPERS);

    const rows = await rollupRowsForMap(mapId);
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    expect(byKind['system.added']?.event_count).toBe(2);
    expect(byKind['connection.create']?.event_count).toBe(1);
    // Null character_id collapses to the 0 sentinel via the view's COALESCE.
    expect(rows.every((r) => r.character_id === '0')).toBe(true);

    const runRow = await lastJobRun();
    expect(runRow!.success).toBe(true);
    expect(runRow!.notes).toMatchObject({ durationMs: expect.any(Number) });
  });

  it('updates counts in place on a second run after new events', async () => {
    await db.insert(apMapEvent).values([
      {
        mapId,
        characterId: null,
        occurredAt: sql`now()`,
        kind: 'system.added',
        payload: { kind: 'system.added', eventId: 4 },
      },
      {
        mapId,
        characterId: null,
        occurredAt: sql`now()`,
        kind: 'system.added',
        payload: { kind: 'system.added', eventId: 5 },
      },
    ]);

    await activityRollupRefresh.run(null, FAKE_HELPERS);

    const rows = await rollupRowsForMap(mapId);
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    expect(byKind['system.added']?.event_count).toBe(4); // 2 + 2
    expect(byKind['connection.create']?.event_count).toBe(1); // unchanged
  });
});

async function lastJobRun() {
  const rows = await db
    .select()
    .from(apJobRun)
    .where(eq(apJobRun.name, 'activity-rollup-refresh'))
    .orderBy(sql`${apJobRun.startedAt} desc`)
    .limit(1);
  return rows[0];
}
