// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apMap,
  apMapCharacterTracking,
  apMapTrackingSeed,
  apUser,
} from '@/db/schema';
import { seedTrackingForMap } from '@/lib/jobs/tracking';

/**
 * Per-map-character-tracking plan, Stage 1. `seedTrackingForMap` is the per-map
 * default: on the first open of a map by an account it auto-tracks all that
 * account's *active* characters, gated by the `ap_map_tracking_seed` marker so
 * it never re-seeds (an intentionally-empty selection must survive).
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const CHAR_A = 95110001n;
const CHAR_B = 95110002n;
const CHAR_KICKED = 95110003n;
const KEYS = [CHAR_A, CHAR_B, CHAR_KICKED].map((id) => `location-poll:${id}`);

/** Remove only this test's poll jobs (public API) — leaves the dev queue alone. */
async function removeOwnPollJobs(): Promise<void> {
  for (const key of KEYS) {
    await db.execute(sql`SELECT graphile_worker.remove_job(${key})`);
  }
}

async function trackedCharacterIds(mapId: bigint): Promise<bigint[]> {
  const rows = await db
    .select({ characterId: apMapCharacterTracking.characterId })
    .from(apMapCharacterTracking)
    .where(eq(apMapCharacterTracking.mapId, mapId))
    .orderBy(apMapCharacterTracking.characterId);
  return rows.map((r) => r.characterId);
}

describe.skipIf(!run)('Stage 1 seedTrackingForMap (real Postgres)', () => {
  let userId = 0;
  let mapId = 0n;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    // `seedTrackingForMap` enqueues via `graphile_worker.add_job`.
    await runMigrations({ pgPool: pool });
    await db.delete(apCharacter).where(inArray(apCharacter.id, [CHAR_A, CHAR_B, CHAR_KICKED]));
    await db.delete(apMap).where(eq(apMap.name, 'track-seed'));
    await removeOwnPollJobs();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;
    await db.insert(apCharacter).values([
      { id: CHAR_A, userId, name: 'Seed A', ownerHash: 'oh-sa' },
      { id: CHAR_B, userId, name: 'Seed B', ownerHash: 'oh-sb' },
      // A non-active character must NOT be seeded.
      { id: CHAR_KICKED, userId, name: 'Seed Kicked', ownerHash: 'oh-sk', status: 'kicked' },
    ]);
    const [m] = await db
      .insert(apMap)
      .values({ scope: 'all', type: 'private', name: 'track-seed' })
      .returning({ id: apMap.id });
    mapId = m!.id;
  });

  afterAll(async () => {
    await db.delete(apMapTrackingSeed).where(eq(apMapTrackingSeed.userId, userId));
    await db
      .delete(apMapCharacterTracking)
      .where(inArray(apMapCharacterTracking.characterId, [CHAR_A, CHAR_B, CHAR_KICKED]));
    await db.delete(apCharacter).where(inArray(apCharacter.id, [CHAR_A, CHAR_B, CHAR_KICKED]));
    await db.delete(apMap).where(eq(apMap.id, mapId));
    await removeOwnPollJobs();
    await pool.end();
  });

  afterEach(async () => {
    await db.delete(apMapTrackingSeed).where(eq(apMapTrackingSeed.userId, userId));
    await db
      .delete(apMapCharacterTracking)
      .where(inArray(apMapCharacterTracking.characterId, [CHAR_A, CHAR_B, CHAR_KICKED]));
    await removeOwnPollJobs();
  });

  it('seeds all active characters and writes the marker on first call', async () => {
    await seedTrackingForMap({ mapId, userId });

    // Only the two active characters — the kicked one is excluded.
    expect(await trackedCharacterIds(mapId)).toEqual([CHAR_A, CHAR_B]);

    const markers = await db
      .select({ mapId: apMapTrackingSeed.mapId })
      .from(apMapTrackingSeed)
      .where(eq(apMapTrackingSeed.userId, userId));
    expect(markers).toHaveLength(1);

    // One poll job per seeded character.
    const countRows = (
      await db.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM graphile_worker.jobs WHERE key IN (${KEYS[0]}, ${KEYS[1]}, ${KEYS[2]})`,
      )
    ).rows;
    expect(countRows[0]?.count).toBe(2);
  });

  it('is a no-op on the second call (marker present) and respects an emptied selection', async () => {
    await seedTrackingForMap({ mapId, userId });
    // The user then deselects everyone on this map.
    await db
      .delete(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.mapId, mapId));

    await seedTrackingForMap({ mapId, userId });

    // No re-seed — the empty selection stands.
    expect(await trackedCharacterIds(mapId)).toEqual([]);
  });
});
