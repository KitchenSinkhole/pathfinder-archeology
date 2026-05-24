// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apMap,
  apMapCharacterTracking,
  apUser,
} from '@/db/schema';

/**
 * Stage 12.0 gate: the new `ap_map_character_tracking` join table applies
 * cleanly, holds a (map, character) row, and cascades cleanly from both sides.
 *
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const CHAR_A = 92000001n;
const CHAR_B = 92000002n;

describe.skipIf(!run)('Stage 12.0 ap_map_character_tracking (real Postgres)', () => {
  let userId = 0;
  let mapA = 0n;
  let mapB = 0n;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    await db.insert(apCharacter).values([
      { id: CHAR_A, userId, name: 'Track Test A', ownerHash: 'oh-a' },
      { id: CHAR_B, userId, name: 'Track Test B', ownerHash: 'oh-b' },
    ]);

    const [m1] = await db
      .insert(apMap)
      .values({ scope: 'all', type: 'private', name: 'track-test-map-a' })
      .returning({ id: apMap.id });
    mapA = m1!.id;
    const [m2] = await db
      .insert(apMap)
      .values({ scope: 'all', type: 'private', name: 'track-test-map-b' })
      .returning({ id: apMap.id });
    mapB = m2!.id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('inserts and reads a tracking row with started_at defaulted', async () => {
    await db.insert(apMapCharacterTracking).values({ mapId: mapA, characterId: CHAR_A });

    const [row] = await db
      .select()
      .from(apMapCharacterTracking)
      .where(
        and(
          eq(apMapCharacterTracking.mapId, mapA),
          eq(apMapCharacterTracking.characterId, CHAR_A),
        ),
      );
    expect(row).toBeDefined();
    expect(row!.startedAt).toBeInstanceOf(Date);
  });

  it('lets one character track multiple maps simultaneously (covers the index)', async () => {
    await db.insert(apMapCharacterTracking).values([
      { mapId: mapB, characterId: CHAR_A },
      { mapId: mapA, characterId: CHAR_B },
    ]);

    const rowsForA = await db
      .select({ mapId: apMapCharacterTracking.mapId })
      .from(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.characterId, CHAR_A));
    expect(rowsForA.map((r) => r.mapId).sort()).toEqual([mapA, mapB].sort());
  });

  it('cascades on map delete', async () => {
    const [m] = await db
      .insert(apMap)
      .values({ scope: 'all', type: 'private', name: 'track-test-map-cascade' })
      .returning({ id: apMap.id });
    await db
      .insert(apMapCharacterTracking)
      .values({ mapId: m!.id, characterId: CHAR_A });

    await db.delete(apMap).where(eq(apMap.id, m!.id));

    const rows = await db
      .select()
      .from(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.mapId, m!.id));
    expect(rows).toHaveLength(0);
  });

  it('cascades on character delete', async () => {
    const tempId = 92000099n;
    await db.insert(apCharacter).values({
      id: tempId,
      userId,
      name: 'Track Temp',
      ownerHash: 'oh-temp',
    });
    await db.insert(apMapCharacterTracking).values({ mapId: mapA, characterId: tempId });

    await db.delete(apCharacter).where(eq(apCharacter.id, tempId));

    const rows = await db
      .select()
      .from(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.characterId, tempId));
    expect(rows).toHaveLength(0);
  });
});

async function cleanup() {
  await db.delete(apMap).where(eq(apMap.name, 'track-test-map-a'));
  await db.delete(apMap).where(eq(apMap.name, 'track-test-map-b'));
  await db.delete(apMap).where(eq(apMap.name, 'track-test-map-cascade'));
  await db.delete(apCharacter).where(eq(apCharacter.id, CHAR_A));
  await db.delete(apCharacter).where(eq(apCharacter.id, CHAR_B));
  await db.delete(apCharacter).where(eq(apCharacter.id, 92000099n));
}
