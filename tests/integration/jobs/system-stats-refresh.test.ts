// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { db, pool } from '@/db/client';
import {
  apJobRun,
  apSystemStats,
  universeConstellation,
  universeRegion,
  universeSystem,
} from '@/db/schema';

// Mock the ESI client surface BEFORE importing anything that uses it. The
// factory uses `importOriginal` so the real `EsiBreakerOpenError` class — which
// the task may receive — stays in scope.
vi.mock('@/lib/esi/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/esi/client')>();
  return { ...actual, esiCall: vi.fn() };
});

import { esiCall, EsiBreakerOpenError } from '@/lib/esi/client';
import { systemStatsRefresh } from '@/lib/jobs/tasks/systemStatsRefresh';

/**
 * Stage 11.3 gates per sub-stage plan:
 *   - With a mocked ESI response, the job produces the expected
 *     `ap_system_stats` rows for that hour bucket; a re-run with new values
 *     updates in-place.
 *   - WH systems are not written.
 *   - Breaker-open from ESI surfaces as a job failure recorded in `ap_job_run`,
 *     not a crash.
 *
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';
const FAKE_HELPERS = {} as unknown as JobHelpers;

const REGION = 98115001;
const CONSTELLATION = 98115001;
const HS = 98115001; // high-sec, should be written
const NS = 98115002; // null-sec, should be written
const WH = 98115003; // wormhole (security 'C3'), should be skipped
const UNKNOWN = 98115004; // ESI returns this id but it's not in our DB (e.g. just deleted)

const mockedEsiCall = vi.mocked(esiCall);

describe.skipIf(!run)('Stage 11.3 system-stats-refresh (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();
    await db.insert(universeRegion).values({ id: REGION, name: 'Stats Refresh Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Stats Refresh Const' });
    await db.insert(universeSystem).values([
      { id: HS, constellationId: CONSTELLATION, name: 'Stats HS', security: 'H' },
      { id: NS, constellationId: CONSTELLATION, name: 'Stats NS', security: '0.0' },
      { id: WH, constellationId: CONSTELLATION, name: 'J999999', security: 'C3' },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  beforeEach(() => {
    mockedEsiCall.mockReset();
  });

  afterEach(async () => {
    await db.delete(apSystemStats).where(inArray(apSystemStats.systemId, [HS, NS, WH, UNKNOWN]));
    await db.delete(apJobRun).where(eq(apJobRun.name, 'system-stats-refresh'));
  });

  it('writes k-space rows, skips WH systems, and ignores unknown system ids', async () => {
    mockedEsiCall.mockImplementation(async (opKey) => {
      if (opKey === 'getUniverseJumps') {
        return [
          { system_id: HS, ship_jumps: 12 },
          { system_id: WH, ship_jumps: 99 },
          { system_id: UNKNOWN, ship_jumps: 1 },
        ];
      }
      if (opKey === 'getUniverseKills') {
        return [
          { system_id: NS, ship_kills: 4, pod_kills: 1, npc_kills: 7 },
          { system_id: WH, ship_kills: 50, pod_kills: 10, npc_kills: 5 },
        ];
      }
      throw new Error(`unexpected opKey ${opKey}`);
    });

    await systemStatsRefresh.run(null, FAKE_HELPERS);

    const rows = await db
      .select({
        systemId: apSystemStats.systemId,
        jumps: apSystemStats.jumps,
        shipKills: apSystemStats.shipKills,
        podKills: apSystemStats.podKills,
        factionKills: apSystemStats.factionKills,
      })
      .from(apSystemStats)
      .where(inArray(apSystemStats.systemId, [HS, NS, WH, UNKNOWN]));

    const bySystem = Object.fromEntries(rows.map((r) => [r.systemId, r]));
    expect(bySystem[HS]).toMatchObject({ jumps: 12, shipKills: 0, podKills: 0, factionKills: 0 });
    expect(bySystem[NS]).toMatchObject({ jumps: 0, shipKills: 4, podKills: 1, factionKills: 7 });
    expect(bySystem[WH]).toBeUndefined();
    expect(bySystem[UNKNOWN]).toBeUndefined();

    const runRow = await lastJobRun();
    expect(runRow!.success).toBe(true);
    expect(runRow!.notes).toMatchObject({
      fetchedJumps: 3,
      fetchedKills: 2,
      upserted: 2,
      skippedNonKspace: 2, // WH + UNKNOWN are not in the k-space allow set
    });
  });

  it('updates rows in place when re-run in the same hour with new values', async () => {
    mockedEsiCall.mockImplementation(async (opKey) => {
      if (opKey === 'getUniverseJumps') return [{ system_id: HS, ship_jumps: 5 }];
      if (opKey === 'getUniverseKills') return [];
      throw new Error(`unexpected opKey ${opKey}`);
    });
    await systemStatsRefresh.run(null, FAKE_HELPERS);

    mockedEsiCall.mockImplementation(async (opKey) => {
      if (opKey === 'getUniverseJumps') return [{ system_id: HS, ship_jumps: 23 }];
      if (opKey === 'getUniverseKills') {
        return [{ system_id: HS, ship_kills: 2, pod_kills: 0, npc_kills: 9 }];
      }
      throw new Error(`unexpected opKey ${opKey}`);
    });
    await systemStatsRefresh.run(null, FAKE_HELPERS);

    const rows = await db
      .select()
      .from(apSystemStats)
      .where(
        and(
          eq(apSystemStats.systemId, HS),
          sql`${apSystemStats.hourBucket} = date_trunc('hour', now())`,
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jumps: 23, shipKills: 2, podKills: 0, factionKills: 9 });
  });

  it('records ap_job_run.success = false when ESI breaker is open (no crash)', async () => {
    mockedEsiCall.mockImplementation(async () => {
      throw new EsiBreakerOpenError('get_universe_system_jumps');
    });

    await expect(systemStatsRefresh.run(null, FAKE_HELPERS)).rejects.toThrow(EsiBreakerOpenError);

    const runRow = await lastJobRun();
    expect(runRow!.success).toBe(false);
    expect(runRow!.errorText).toMatch(/circuit breaker open/i);
  });
});

async function lastJobRun() {
  const rows = await db
    .select()
    .from(apJobRun)
    .where(eq(apJobRun.name, 'system-stats-refresh'))
    .orderBy(sql`${apJobRun.startedAt} desc`)
    .limit(1);
  return rows[0];
}

async function cleanup() {
  await db.delete(apJobRun).where(eq(apJobRun.name, 'system-stats-refresh'));
  await db.delete(apSystemStats).where(inArray(apSystemStats.systemId, [HS, NS, WH, UNKNOWN]));
  await db.delete(universeSystem).where(inArray(universeSystem.id, [HS, NS, WH, UNKNOWN]));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
