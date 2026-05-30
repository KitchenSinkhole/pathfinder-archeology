// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { db, pool } from '@/db/client';
import {
  apJobRun,
  universeConstellation,
  universeFactionWarSystem,
  universeRegion,
  universeSovereigntyMap,
  universeSystem,
} from '@/db/schema';

vi.mock('@/lib/esi/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/esi/client')>();
  return { ...actual, esiCall: vi.fn() };
});

vi.mock('@/lib/integrations/evescout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/evescout')>();
  return {
    ...actual,
    fetchEveScoutConnections: vi.fn(async () => [
      {
        sourceName: 'Thera',
        sourceSystemId: 31000005,
        targetName: 'Sov HS',
        targetSystemId: 98213001,
        signatureId: 'ABC',
        hub: 'Thera',
        updatedAt: null,
        expiresAt: null,
      },
    ]),
  };
});

import { esiCall } from '@/lib/esi/client';
import { sovFwRefresh } from '@/lib/jobs/tasks/sovFwRefresh';
import { intelForSystems } from '@/lib/map/intel';

const run = process.env.RUN_DB_TESTS === '1';
const FAKE_HELPERS = {} as unknown as JobHelpers;

const REGION = 98213001;
const CONSTELLATION = 98213001;
const HS = 98213001;
const LS = 98213002;
const WH = 98213003;
const UNKNOWN = 98213004;

const mockedEsiCall = vi.mocked(esiCall);

describe.skipIf(!run)('Stage 13 sov-fw-refresh (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();
    await db.insert(universeRegion).values({ id: REGION, name: 'Sov Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Sov Constellation' });
    await db.insert(universeSystem).values([
      { id: HS, constellationId: CONSTELLATION, name: 'Sov HS', security: 'H' },
      { id: LS, constellationId: CONSTELLATION, name: 'Sov LS', security: 'L' },
      { id: WH, constellationId: CONSTELLATION, name: 'J982130', security: 'C3' },
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
    await cleanupRows();
  });

  it('upserts k-space sov/FW rows, skips WH/unknown systems, and records notes', async () => {
    await seedStaleRows();
    mockedEsiCall.mockImplementation(async (opKey) => {
      if (opKey === 'getSovereigntyMap') {
        return [
          { system_id: HS, alliance_id: 99000001, corporation_id: 98000001 },
          { system_id: WH, alliance_id: 99000002 },
          { system_id: UNKNOWN, faction_id: 500001 },
        ];
      }
      if (opKey === 'getFactionWarSystems') {
        return [
          {
            solar_system_id: LS,
            owner_faction_id: 500001,
            occupier_faction_id: 500002,
            contested: 'contested',
            victory_points: 50,
            victory_points_threshold: 100,
          },
          { solar_system_id: WH, owner_faction_id: 500003 },
        ];
      }
      throw new Error(`unexpected opKey ${opKey}`);
    });

    await sovFwRefresh.run(null, FAKE_HELPERS);

    const sovRows = await db
      .select()
      .from(universeSovereigntyMap)
      .where(inArray(universeSovereigntyMap.systemId, [HS, LS, WH, UNKNOWN]));
    expect(sovRows).toHaveLength(1);
    expect(sovRows[0]).toMatchObject({
      systemId: HS,
      allianceId: 99000001n,
      corporationId: 98000001n,
    });

    const fwRows = await db
      .select()
      .from(universeFactionWarSystem)
      .where(inArray(universeFactionWarSystem.systemId, [HS, LS, WH, UNKNOWN]));
    expect(fwRows).toHaveLength(1);
    expect(fwRows[0]).toMatchObject({
      systemId: LS,
      ownerFactionId: 500001n,
      occupierFactionId: 500002n,
      contested: 'contested',
      victoryPoints: 50,
    });

    const runRow = await lastJobRun();
    expect(runRow!.success).toBe(true);
    expect(runRow!.notes).toMatchObject({
      fetchedSov: 3,
      fetchedFw: 2,
      upsertedSov: 1,
      upsertedFw: 1,
      deletedSov: 1,
      deletedFw: 1,
      skippedNonKspace: 2,
    });
  });

  it('loads sov/FW and soft-failed external intel by system id', async () => {
    await db.insert(universeSovereigntyMap).values({
      systemId: HS,
      allianceId: 99000001n,
      corporationId: 98000001n,
    });
    await db.insert(universeFactionWarSystem).values({
      systemId: LS,
      ownerFactionId: 500001n,
      occupierFactionId: 500002n,
      contested: 'vulnerable',
      victoryPoints: 10,
      victoryPointsThreshold: 20,
    });

    const intel = await intelForSystems([HS, LS]);

    expect(intel[HS]!.sovereignty).toMatchObject({
      allianceId: '99000001',
      corporationId: '98000001',
      allianceImage: 'https://images.evetech.net/alliances/99000001/logo?size=64',
    });
    expect(intel[HS]!.scoutConnections).toHaveLength(1);
    expect(intel[LS]!.factionWar).toMatchObject({
      occupierFactionId: '500002',
      contested: 'vulnerable',
      victoryPoints: 10,
    });
  });
});

async function seedStaleRows() {
  await db.insert(universeSovereigntyMap).values({ systemId: LS, allianceId: 99111111n });
  await db.insert(universeFactionWarSystem).values({ systemId: HS, ownerFactionId: 501111n });
}

async function lastJobRun() {
  const rows = await db
    .select()
    .from(apJobRun)
    .where(eq(apJobRun.name, 'sov-fw-refresh'))
    .orderBy(sql`${apJobRun.startedAt} desc`)
    .limit(1);
  return rows[0];
}

async function cleanupRows() {
  await db.delete(apJobRun).where(eq(apJobRun.name, 'sov-fw-refresh'));
  await db
    .delete(universeFactionWarSystem)
    .where(inArray(universeFactionWarSystem.systemId, [HS, LS, WH, UNKNOWN]));
  await db
    .delete(universeSovereigntyMap)
    .where(inArray(universeSovereigntyMap.systemId, [HS, LS, WH, UNKNOWN]));
}

async function cleanup() {
  await cleanupRows();
  await db.delete(universeSystem).where(inArray(universeSystem.id, [HS, LS, WH, UNKNOWN]));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
