// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db/client';
import { apCharacter, apMap, apMapEvent, apUser } from '@/db/schema';
import { loadActivityStats, resolveStatsAccess } from '@/lib/stats/activity';

/**
 * Stage 17.7 gate: activity statistics over `ap_activity_rollup`.
 *
 * Verifies, against real Postgres, that the reader: rolls an account's alts up
 * to its main, excludes `map.*` kinds, respects map-scope visibility, places
 * prior-week activity in the sparkline series but not the current triplet, and
 * buckets null-character events as the "(unknown)" row.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test statistics
 */
const run = process.env.RUN_DB_TESTS === '1';

const CORP_MAIN = 99500001n;
const CORP_OTHER = 99500002n;
const ALLIANCE_MAIN = 99500901n;

const MAIN_ID = 99501001n;
const ALT_ID = 99501002n;
const OUTSIDER_ID = 99501003n;

const characterIds = [MAIN_ID, ALT_ID, OUTSIDER_ID];

const PRIVATE_MAP = 'Stats Private Map';
const CORP_MAP = 'Stats Corp Map';
const OTHER_MAP = 'Stats Other-Corp Map';

let userId = 0;
let outsiderUserId = 0;
let privateMapId = 0n;
let corpMapId = 0n;
let otherMapId = 0n;

const NOW = new Date();
const LAST_WEEK = new Date(NOW.getTime() - 7 * 86400000);

function session(characterId: bigint): Session {
  return { characterId: characterId.toString(), expires: '' } as unknown as Session;
}

/** N rollup rows of one kind on a map by a character at a given time. */
function events(
  mapId: bigint,
  characterId: bigint | null,
  kind: string,
  count: number,
  when: Date,
) {
  return Array.from({ length: count }, () => ({
    mapId,
    characterId,
    kind,
    occurredAt: when,
    payload: null,
  }));
}

describe.skipIf(!run)('Stage 17.7 — activity statistics (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;
    const [ou] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    outsiderUserId = ou!.id;

    await db.insert(apCharacter).values([
      mkChar(MAIN_ID, 'Main Pilot', userId, CORP_MAIN, ALLIANCE_MAIN),
      mkChar(ALT_ID, 'Alt Pilot', userId, CORP_MAIN, ALLIANCE_MAIN),
      mkChar(OUTSIDER_ID, 'Outsider', outsiderUserId, CORP_OTHER, null),
    ]);
    // Main is the account's main; the alt's activity must roll up to it.
    await db.update(apUser).set({ mainCharacterId: MAIN_ID }).where(eq(apUser.id, userId));

    const inserted = await db
      .insert(apMap)
      .values([
        { name: PRIVATE_MAP, scope: 'wh', type: 'private', ownerCharacterId: MAIN_ID },
        { name: CORP_MAP, scope: 'all', type: 'corp', ownerCorporationId: CORP_MAIN },
        { name: OTHER_MAP, scope: 'all', type: 'corp', ownerCorporationId: CORP_OTHER },
      ])
      .returning({ id: apMap.id, name: apMap.name });
    privateMapId = inserted.find((m) => m.name === PRIVATE_MAP)!.id;
    corpMapId = inserted.find((m) => m.name === CORP_MAP)!.id;
    otherMapId = inserted.find((m) => m.name === OTHER_MAP)!.id;

    await db.insert(apMapEvent).values([
      // Private map, current week.
      ...events(privateMapId, MAIN_ID, 'system.added', 2, NOW),
      ...events(privateMapId, MAIN_ID, 'connection.create', 1, NOW),
      ...events(privateMapId, MAIN_ID, 'map.create', 1, NOW), // excluded (map.*)
      ...events(privateMapId, ALT_ID, 'signature.create', 1, NOW), // rolls up to main
      ...events(privateMapId, null, 'connection.delete', 1, NOW), // erased → unknown bucket
      // A substantive system.updated counts; a drag-only position move does not.
      {
        mapId: privateMapId,
        characterId: MAIN_ID,
        kind: 'system.updated',
        occurredAt: NOW,
        payload: { kind: 'system.updated', id: '1', status: 'hostile' },
      },
      {
        mapId: privateMapId,
        characterId: MAIN_ID,
        kind: 'system.updated',
        occurredAt: NOW,
        payload: { kind: 'system.updated', id: '1', positionX: 10, positionY: 20 },
      },
      // Private map, prior week — series only, not the current triplet.
      ...events(privateMapId, MAIN_ID, 'system.added', 1, LAST_WEEK),
      // Corp map, current week.
      ...events(corpMapId, MAIN_ID, 'connection.update', 3, NOW),
      // Other-corp map — main cannot view; must never appear.
      ...events(otherMapId, OUTSIDER_ID, 'system.added', 5, NOW),
    ]);

    await db.execute(sql`REFRESH MATERIALIZED VIEW "ap_activity_rollup"`);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('exposes the scope tabs the account qualifies for', async () => {
    expect(await resolveStatsAccess(session(MAIN_ID))).toEqual(['private', 'corp', 'alliance']);
    // Outsider has a corp but no alliance.
    expect(await resolveStatsAccess(session(OUTSIDER_ID))).toEqual(['private', 'corp']);
    expect(await resolveStatsAccess(null)).toEqual([]);
  });

  it('rolls alt activity into the main and excludes map.* kinds', async () => {
    const stats = await loadActivityStats({ session: session(MAIN_ID), scope: 'private', period: 'week' });
    const main = stats.rows.find((r) => r.mainCharacterId === MAIN_ID.toString());
    expect(main).toBeDefined();
    // 2 system.added + 1 substantive system.updated + 1 connection.create +
    // 1 signature.create (alt). map.create + the position-only move excluded.
    expect(main!.total).toBe(5);
    expect(main!.system.create).toBe(2);
    expect(main!.system.update).toBe(1);
    expect(main!.connection.create).toBe(1);
    expect(main!.signature.create).toBe(1); // contributed by the alt
    expect(main!.characterName).toBe('Main Pilot');
    // The alt is not a separate row.
    expect(stats.rows.some((r) => r.mainCharacterId === ALT_ID.toString())).toBe(false);
  });

  it('places prior-week activity in the sparkline series, not the current triplet', async () => {
    const stats = await loadActivityStats({ session: session(MAIN_ID), scope: 'private', period: 'week' });
    const main = stats.rows.find((r) => r.mainCharacterId === MAIN_ID.toString())!;
    expect(main.series).toHaveLength(12);
    expect(main.series.at(-1)).toBe(5); // current bucket = current total
    const seriesSum = main.series.reduce((s, n) => s + n, 0);
    expect(seriesSum).toBe(6); // + the 1 system.added from last week
  });

  it('excludes drag-only position moves from the update stat', async () => {
    const stats = await loadActivityStats({ session: session(MAIN_ID), scope: 'private', period: 'week' });
    const main = stats.rows.find((r) => r.mainCharacterId === MAIN_ID.toString())!;
    // Two system.updated events were seeded: one substantive (status), one a
    // pure position move. Only the substantive one counts.
    expect(main.system.update).toBe(1);
  });

  it('buckets null-character events as the unknown row', async () => {
    const stats = await loadActivityStats({ session: session(MAIN_ID), scope: 'private', period: 'week' });
    const unknown = stats.rows.find((r) => r.mainCharacterId === '0');
    expect(unknown).toBeDefined();
    expect(unknown!.characterName).toBe('(unknown)');
    expect(unknown!.portraitUrl).toBeNull();
    expect(unknown!.connection.delete).toBe(1);
    expect(unknown!.total).toBe(1);
  });

  it('scopes corp stats to viewable corp maps only', async () => {
    const stats = await loadActivityStats({ session: session(MAIN_ID), scope: 'corp', period: 'week' });
    const main = stats.rows.find((r) => r.mainCharacterId === MAIN_ID.toString())!;
    expect(main.connection.update).toBe(3);
    expect(main.total).toBe(3);
    // The other corp's map is invisible to main — outsider activity never leaks.
    expect(stats.rows.some((r) => r.mainCharacterId === OUTSIDER_ID.toString())).toBe(false);
  });

  it('cannot navigate past the current period', async () => {
    const stats = await loadActivityStats({ session: session(MAIN_ID), scope: 'private', period: 'week' });
    expect(stats.hasNext).toBe(false);
  });
});

function mkChar(
  id: bigint,
  name: string,
  uid: number,
  corporationId: bigint,
  allianceId: bigint | null,
) {
  return {
    id,
    name,
    userId: uid,
    ownerHash: `hash-${id.toString()}`,
    authzLevel: 'member',
    status: 'active',
    corporationId,
    allianceId,
  } as const;
}

async function cleanup() {
  await db.delete(apMap).where(sql`name IN (${PRIVATE_MAP}, ${CORP_MAP}, ${OTHER_MAP})`);
  await db.delete(apCharacter).where(inArray(apCharacter.id, characterIds));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
  if (outsiderUserId) {
    await db.delete(apUser).where(eq(apUser.id, outsiderUserId));
    outsiderUserId = 0;
  }
  privateMapId = 0n;
  corpMapId = 0n;
  otherMapId = 0n;
}
