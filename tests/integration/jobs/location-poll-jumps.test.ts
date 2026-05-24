// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Job, JobHelpers, TaskSpec } from 'graphile-worker';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apJobRun,
  apMap,
  apMapCharacterTracking,
  apMapConnection,
  apMapEvent,
  apMapSystem,
  apUser,
  universeConstellation,
  universeRegion,
  universeStargateEdge,
  universeSystem,
} from '@/db/schema';

vi.mock('@/lib/esi/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/esi/client')>();
  return { ...actual, esiCall: vi.fn() };
});

import { esiCall } from '@/lib/esi/client';
import { locationPoll } from '@/lib/jobs/tasks/locationPoll';

/**
 * Stage 12.2 gates per the sub-stage plan:
 *  - Gate jump (between two `universe_stargate_edge`-linked systems) writes
 *    nothing — `ap_map_event` row count for the map is unchanged.
 *  - Wormhole jump (no edge between the systems) writes exactly three events
 *    per active tracked map (`system.added` × 2 + `connection.create`).
 *  - Re-running the same wormhole jump is idempotent: no new events.
 *  - Soft-deleted maps are excluded from the fan-out.
 *
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const CHAR_ID = 94000001n;
const REGION = 98120001;
const CONSTELLATION = 98120001;
const SYS_A = 98120001; // K-space (Jita-like)
const SYS_B = 98120002; // K-space, gate-adjacent to SYS_A
const SYS_C = 98120003; // WH-like; NOT gate-adjacent to anything

interface CapturedJob {
  identifier: string;
  payload: unknown;
  spec?: TaskSpec;
}
function makeHelpers(): { helpers: JobHelpers; captured: CapturedJob[] } {
  const captured: CapturedJob[] = [];
  const helpers = {
    addJob: vi.fn(async (identifier: string, payload: unknown, spec?: TaskSpec) => {
      captured.push({ identifier, payload, spec });
      return {} as Job;
    }),
  } as unknown as JobHelpers;
  return { helpers, captured };
}

const mockedEsiCall = vi.mocked(esiCall);

function mockEsi(opts: { online: boolean; systemId?: number; shipTypeId?: number }): void {
  mockedEsiCall.mockImplementation(async (opKey) => {
    if (opKey === 'getCharacterOnline') return { online: opts.online };
    if (opKey === 'getCharacterLocation') return { solar_system_id: opts.systemId };
    if (opKey === 'getCharacterShip') {
      return {
        ship_type_id: opts.shipTypeId ?? 670,
        ship_item_id: 1,
        ship_name: 'Test',
      };
    }
    throw new Error(`unexpected opKey ${opKey}`);
  });
}

async function eventCount(mapId: bigint): Promise<number> {
  const result = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${mapId}`,
  );
  return result.rows[0]!.count;
}

async function eventKinds(mapId: bigint): Promise<string[]> {
  const rows = await db
    .select({ kind: apMapEvent.kind })
    .from(apMapEvent)
    .where(eq(apMapEvent.mapId, mapId))
    .orderBy(apMapEvent.occurredAt);
  return rows.map((r) => r.kind);
}

async function lastJobNotes() {
  const [row] = await db
    .select({ notes: apJobRun.notes })
    .from(apJobRun)
    .where(eq(apJobRun.name, 'location-poll'))
    .orderBy(desc(apJobRun.startedAt))
    .limit(1);
  return row?.notes as Record<string, unknown> | undefined;
}

describe.skipIf(!run)('Stage 12.2 location-poll jump classification + fan-out (real Postgres)', () => {
  let userId = 0;
  let mapA = 0n;
  let mapB = 0n;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    await db.insert(universeRegion).values({ id: REGION, name: 'Jumps Test Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Jumps Test Const' });
    await db.insert(universeSystem).values([
      { id: SYS_A, constellationId: CONSTELLATION, name: 'Jumps A', security: 'H' },
      { id: SYS_B, constellationId: CONSTELLATION, name: 'Jumps B', security: 'H' },
      { id: SYS_C, constellationId: CONSTELLATION, name: 'J133003', security: 'C3' },
    ]);
    // Bidirectional gate pair A↔B; no edges touching C.
    await db.insert(universeStargateEdge).values([
      { fromSystemId: SYS_A, toSystemId: SYS_B },
      { fromSystemId: SYS_B, toSystemId: SYS_A },
    ]);

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;
    await db.insert(apCharacter).values({
      id: CHAR_ID,
      userId,
      name: 'Jump Test',
      ownerHash: 'oh-jump',
    });

    const [a] = await db
      .insert(apMap)
      .values({ scope: 'all', type: 'private', name: 'jumps-test-map-a' })
      .returning({ id: apMap.id });
    mapA = a!.id;
    const [b] = await db
      .insert(apMap)
      .values({ scope: 'all', type: 'private', name: 'jumps-test-map-b' })
      .returning({ id: apMap.id });
    mapB = b!.id;

    await db.insert(apMapCharacterTracking).values([
      { mapId: mapA, characterId: CHAR_ID },
      { mapId: mapB, characterId: CHAR_ID },
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
    // Wipe the per-map canvas + history so each `it` starts from a clean slate.
    // ap_map_signature is empty for these tests; nothing else to scrub.
    await db.delete(apMapConnection).where(inArray(apMapConnection.mapId, [mapA, mapB]));
    await db.delete(apMapSystem).where(inArray(apMapSystem.mapId, [mapA, mapB]));
    await db.delete(apMapEvent).where(inArray(apMapEvent.mapId, [mapA, mapB]));
    await db.delete(apJobRun).where(eq(apJobRun.name, 'location-poll'));
    // Reset character so each test controls `previousSystemId` explicitly.
    await db
      .update(apCharacter)
      .set({ lastSystemId: null, lastShipTypeId: null, lastOnline: null, lastLocationAt: null })
      .where(eq(apCharacter.id, CHAR_ID));
    // Unsoft-delete in case a previous test toggled it.
    await db.update(apMap).set({ deletedAt: null }).where(inArray(apMap.id, [mapA, mapB]));
    // Re-seed tracking rows in case a previous test removed them.
    await db
      .insert(apMapCharacterTracking)
      .values([
        { mapId: mapA, characterId: CHAR_ID },
        { mapId: mapB, characterId: CHAR_ID },
      ])
      .onConflictDoNothing();
  });

  it('first tick with no prior location writes nothing but persists current', async () => {
    mockEsi({ online: true, systemId: SYS_A });
    const { helpers } = makeHelpers();
    await locationPoll.run({ characterId: CHAR_ID.toString() }, helpers);

    expect(await eventCount(mapA)).toBe(0);
    expect(await eventCount(mapB)).toBe(0);

    const notes = await lastJobNotes();
    expect(notes).toMatchObject({
      online: true,
      previousSystemId: null,
      currentSystemId: SYS_A,
      jumpClass: null,
    });
  });

  it('gate jump (A→B) emits no events and classifies as gate', async () => {
    await db.update(apCharacter).set({ lastSystemId: SYS_A }).where(eq(apCharacter.id, CHAR_ID));
    mockEsi({ online: true, systemId: SYS_B });
    const { helpers } = makeHelpers();

    await locationPoll.run({ characterId: CHAR_ID.toString() }, helpers);

    expect(await eventCount(mapA)).toBe(0);
    expect(await eventCount(mapB)).toBe(0);

    const notes = await lastJobNotes();
    expect(notes).toMatchObject({
      jumpClass: 'gate',
      previousSystemId: SYS_A,
      currentSystemId: SYS_B,
    });
    expect(notes!.folds).toBeUndefined();
  });

  it('wormhole jump (B→C) emits three events per active tracked map', async () => {
    await db.update(apCharacter).set({ lastSystemId: SYS_B }).where(eq(apCharacter.id, CHAR_ID));
    mockEsi({ online: true, systemId: SYS_C });
    const { helpers } = makeHelpers();

    await locationPoll.run({ characterId: CHAR_ID.toString() }, helpers);

    expect(await eventKinds(mapA)).toEqual(['system.added', 'system.added', 'connection.create']);
    expect(await eventKinds(mapB)).toEqual(['system.added', 'system.added', 'connection.create']);

    const [conn] = await db
      .select({
        scope: apMapConnection.scope,
        massStatus: apMapConnection.massStatus,
        isEol: apMapConnection.isEol,
      })
      .from(apMapConnection)
      .where(eq(apMapConnection.mapId, mapA));
    expect(conn).toMatchObject({ scope: 'wh', massStatus: 'fresh', isEol: false });

    const notes = await lastJobNotes();
    expect(notes!.jumpClass).toBe('wormhole');
    expect(notes!.folds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromSystemAdded: true,
          toSystemAdded: true,
          connectionCreated: true,
        }),
      ]),
    );
  });

  it('repeated wormhole jump is idempotent (no new events)', async () => {
    // First pass — primes the maps.
    await db.update(apCharacter).set({ lastSystemId: SYS_B }).where(eq(apCharacter.id, CHAR_ID));
    mockEsi({ online: true, systemId: SYS_C });
    await locationPoll.run({ characterId: CHAR_ID.toString() }, makeHelpers().helpers);
    const baselineA = await eventCount(mapA);
    const baselineB = await eventCount(mapB);
    expect(baselineA).toBe(3);

    // Second pass with the same source→target — handler treats lastSystemId=SYS_C
    // (persisted by the first call) → SYS_C as a no-op (same system), so reset
    // last back to SYS_B and re-fire.
    await db.update(apCharacter).set({ lastSystemId: SYS_B }).where(eq(apCharacter.id, CHAR_ID));
    await locationPoll.run({ characterId: CHAR_ID.toString() }, makeHelpers().helpers);

    expect(await eventCount(mapA)).toBe(baselineA); // no new events
    expect(await eventCount(mapB)).toBe(baselineB);

    const notes = await lastJobNotes();
    expect(notes!.jumpClass).toBe('wormhole');
    expect(notes!.folds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromSystemAdded: false,
          toSystemAdded: false,
          connectionCreated: false,
        }),
      ]),
    );
  });

  it('soft-deleted maps are excluded from the fan-out', async () => {
    await db.update(apMap).set({ deletedAt: sql`now()` }).where(eq(apMap.id, mapB));
    await db.update(apCharacter).set({ lastSystemId: SYS_B }).where(eq(apCharacter.id, CHAR_ID));
    mockEsi({ online: true, systemId: SYS_C });

    await locationPoll.run({ characterId: CHAR_ID.toString() }, makeHelpers().helpers);

    expect(await eventCount(mapA)).toBe(3);
    expect(await eventCount(mapB)).toBe(0);

    const notes = await lastJobNotes();
    const folds = notes!.folds as Array<{ mapId: string }>;
    expect(folds).toHaveLength(1);
    expect(folds[0]!.mapId).toBe(mapA.toString());
  });
});

async function cleanup() {
  await db.delete(apJobRun).where(eq(apJobRun.name, 'location-poll'));
  await db
    .delete(apMapCharacterTracking)
    .where(eq(apMapCharacterTracking.characterId, CHAR_ID));
  await db
    .delete(apMap)
    .where(and(sql`name like 'jumps-test-map-%'`, isNull(apMap.deletedAt)));
  // Also delete any soft-deleted ones a prior run left behind.
  await db.delete(apMap).where(sql`name like 'jumps-test-map-%'`);
  await db.delete(apCharacter).where(eq(apCharacter.id, CHAR_ID));
  await db
    .delete(universeStargateEdge)
    .where(
      inArray(universeStargateEdge.fromSystemId, [SYS_A, SYS_B, SYS_C]),
    );
  await db.delete(universeSystem).where(inArray(universeSystem.id, [SYS_A, SYS_B, SYS_C]));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
