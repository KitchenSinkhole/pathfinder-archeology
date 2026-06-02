// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { db, pool } from '@/db/client';
import { apCharacter, apMap, apMapCharacterTracking, apUser } from '@/db/schema';
import { startTrackingCharacter, stopTrackingCharacter } from '@/lib/jobs/tracking';

/**
 * Per-map-character-tracking plan, Stage 3. Tracking is now purely per-map: a
 * row in `ap_map_character_tracking` (map_id, character_id) is the single source
 * of truth, and there is no global `tracking_enabled` flag. The Characters panel
 * checkbox composes `startTrackingCharacter` / `stopTrackingCharacter` for ONE
 * map at a time — unlike the retired auto-follow (`trackCharactersOnMap`), they
 * never touch a character's rows on other maps.
 *
 * This file locks per-map add/remove independence. The seed-once / deselect-all
 * default lives in `tracking-seed.test.ts`; the multi-map poll fan-out lives in
 * `location-poll-jumps.test.ts`.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const CHAR_A = 95100001n;
const CHAR_B = 95100002n;
const KEY_A = `location-poll:${CHAR_A}`;
const KEY_B = `location-poll:${CHAR_B}`;

/** Remove only this test's poll jobs (public API) — leaves the dev queue alone. */
async function removeOwnPollJobs(): Promise<void> {
  await db.execute(sql`SELECT graphile_worker.remove_job(${KEY_A})`);
  await db.execute(sql`SELECT graphile_worker.remove_job(${KEY_B})`);
}

async function trackedMapIds(characterId: bigint): Promise<bigint[]> {
  const rows = await db
    .select({ mapId: apMapCharacterTracking.mapId })
    .from(apMapCharacterTracking)
    .where(eq(apMapCharacterTracking.characterId, characterId))
    .orderBy(apMapCharacterTracking.mapId);
  return rows.map((r) => r.mapId);
}

describe.skipIf(!run)('Stage 3 per-map tracking toggle (real Postgres)', () => {
  let userId = 0;
  let mapA = 0n;
  let mapB = 0n;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    // `startTrackingCharacter` enqueues via `graphile_worker.add_job`.
    await runMigrations({ pgPool: pool });
    await db.delete(apCharacter).where(inArray(apCharacter.id, [CHAR_A, CHAR_B]));
    await db.delete(apMap).where(inArray(apMap.name, ['track-toggle-A', 'track-toggle-B']));
    await removeOwnPollJobs();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;
    await db.insert(apCharacter).values([
      { id: CHAR_A, userId, name: 'Toggle A', ownerHash: 'oh-ta' },
      { id: CHAR_B, userId, name: 'Toggle B', ownerHash: 'oh-tb' },
    ]);
    const maps = await db
      .insert(apMap)
      .values([
        { scope: 'all', type: 'private', name: 'track-toggle-A' },
        { scope: 'all', type: 'private', name: 'track-toggle-B' },
      ])
      .returning({ id: apMap.id, name: apMap.name });
    mapA = maps.find((m) => m.name === 'track-toggle-A')!.id;
    mapB = maps.find((m) => m.name === 'track-toggle-B')!.id;
  });

  afterAll(async () => {
    await db.delete(apMapCharacterTracking).where(inArray(apMapCharacterTracking.characterId, [CHAR_A, CHAR_B]));
    await db.delete(apCharacter).where(inArray(apCharacter.id, [CHAR_A, CHAR_B]));
    await db.delete(apMap).where(inArray(apMap.id, [mapA, mapB]));
    await removeOwnPollJobs();
    await pool.end();
  });

  afterEach(async () => {
    await db.delete(apMapCharacterTracking).where(inArray(apMapCharacterTracking.characterId, [CHAR_A, CHAR_B]));
    await removeOwnPollJobs();
  });

  it('startTrackingCharacter tracks a character on multiple maps simultaneously (no auto-follow)', async () => {
    const first = await startTrackingCharacter({ mapId: mapA, characterId: CHAR_A });
    const second = await startTrackingCharacter({ mapId: mapB, characterId: CHAR_A });

    expect(first).toEqual({ ok: true, alreadyTracked: false });
    expect(second).toEqual({ ok: true, alreadyTracked: false });
    // Both maps stand — opening mapB did NOT pull CHAR_A off mapA.
    const expected = [mapA, mapB].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(await trackedMapIds(CHAR_A)).toEqual(expected);

    // One poll job for the character (shared job key, preserve_run_at).
    const countRows = (
      await db.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM graphile_worker.jobs WHERE key = ${KEY_A}`,
      )
    ).rows;
    expect(countRows[0]?.count).toBe(1);
  });

  it('startTrackingCharacter is idempotent for the same (map, character)', async () => {
    await startTrackingCharacter({ mapId: mapA, characterId: CHAR_A });
    const again = await startTrackingCharacter({ mapId: mapA, characterId: CHAR_A });

    expect(again).toEqual({ ok: true, alreadyTracked: true });
    expect(await trackedMapIds(CHAR_A)).toEqual([mapA]);
  });

  it('stopTrackingCharacter removes only the row for that one map', async () => {
    await startTrackingCharacter({ mapId: mapA, characterId: CHAR_A });
    await startTrackingCharacter({ mapId: mapB, characterId: CHAR_A });

    const stopped = await stopTrackingCharacter({ mapId: mapB, characterId: CHAR_A });

    expect(stopped).toEqual({ removed: true });
    expect(await trackedMapIds(CHAR_A)).toEqual([mapA]); // still tracked on mapA
  });

  it('per-character independence: stopping one character leaves the other untouched', async () => {
    await startTrackingCharacter({ mapId: mapA, characterId: CHAR_A });
    await startTrackingCharacter({ mapId: mapA, characterId: CHAR_B });

    await stopTrackingCharacter({ mapId: mapA, characterId: CHAR_A });

    expect(await trackedMapIds(CHAR_A)).toEqual([]);
    expect(await trackedMapIds(CHAR_B)).toEqual([mapA]);
  });

  it('stopTrackingCharacter reports removed:false when no row exists', async () => {
    const stopped = await stopTrackingCharacter({ mapId: mapA, characterId: CHAR_A });
    expect(stopped).toEqual({ removed: false });
  });
});
