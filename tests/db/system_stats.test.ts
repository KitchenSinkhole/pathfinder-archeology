// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import {
  apSystemStats,
  universeConstellation,
  universeRegion,
  universeSystem,
} from '@/db/schema';
import { statsForSystems } from '@/lib/map/stats';

const REGION = 98010001;
const CONSTELLATION = 98010001;
const SYSTEM = 98010001;

describe('statsForSystems (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();
    await db.insert(universeRegion).values({ id: REGION, name: 'Stats Test Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Stats Test Const' });
    await db
      .insert(universeSystem)
      .values({ id: SYSTEM, constellationId: CONSTELLATION, name: 'Stats Test System' });
    // One bucket inside the 24h window, one outside it.
    await db.insert(apSystemStats).values([
      {
        systemId: SYSTEM,
        hourBucket: sql`now() - interval '2 hours'`,
        jumps: 10,
        shipKills: 3,
        podKills: 1,
        factionKills: 5,
      },
      {
        systemId: SYSTEM,
        hourBucket: sql`now() - interval '1 hour'`,
        jumps: 4,
        shipKills: 1,
        podKills: 0,
        factionKills: 2,
      },
      {
        systemId: SYSTEM,
        hourBucket: sql`now() - interval '30 hours'`,
        jumps: 999,
        shipKills: 999,
        podKills: 999,
        factionKills: 999,
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('sums only the rolling 24h window', async () => {
    const result = await statsForSystems([SYSTEM]);
    expect(result[SYSTEM]).toEqual({ jumps: 14, shipKills: 4, podKills: 1, factionKills: 7 });
  });

  it('omits systems with no rows in window', async () => {
    const result = await statsForSystems([SYSTEM, 12345678]);
    expect(result[12345678]).toBeUndefined();
  });

  it('returns an empty record for empty input', async () => {
    expect(await statsForSystems([])).toEqual({});
  });
});

async function cleanup() {
  await db.delete(apSystemStats).where(eq(apSystemStats.systemId, SYSTEM));
  await db.delete(universeSystem).where(eq(universeSystem.id, SYSTEM));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
