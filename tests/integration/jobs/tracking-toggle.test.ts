// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import type { Job, JobHelpers, TaskSpec } from 'graphile-worker';
import { db, pool } from '@/db/client';
import { apCharacter, apJobRun, apMap, apMapCharacterTracking, apUser } from '@/db/schema';

vi.mock('@/lib/esi/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/esi/client')>();
  return { ...actual, esiCall: vi.fn() };
});

import { esiCall } from '@/lib/esi/client';
import { locationPoll } from '@/lib/jobs/tasks/locationPoll';
import {
  stopAllTrackingForCharacter,
  trackCharactersOnMap,
} from '@/lib/jobs/tracking';

/**
 * Stage 17.5 follow-up. The Characters panel toggle composes:
 *   - `trackCharactersOnMap` — point each enabled character at the last-open
 *     map and move it off any other (single map per character).
 *   - `stopAllTrackingForCharacter` — disabling drops every tracking row.
 *   - the `location-poll` `tracking_enabled` gate — a disabled character's tick
 *     exits cleanly without touching ESI or re-enqueuing.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const CHAR_A = 95100001n;
const CHAR_B = 95100002n;
const KEY_A = `location-poll:${CHAR_A}`;
const KEY_B = `location-poll:${CHAR_B}`;
const mockedEsiCall = vi.mocked(esiCall);

/** Remove only this test's poll jobs (public API) — leaves the dev queue alone. */
async function removeOwnPollJobs(): Promise<void> {
  await db.execute(sql`SELECT graphile_worker.remove_job(${KEY_A})`);
  await db.execute(sql`SELECT graphile_worker.remove_job(${KEY_B})`);
}

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

async function lastRunNotes(): Promise<unknown> {
  const [row] = await db
    .select({ notes: apJobRun.notes })
    .from(apJobRun)
    .where(eq(apJobRun.name, 'location-poll'))
    .orderBy(desc(apJobRun.startedAt))
    .limit(1);
  return row?.notes;
}

async function trackedMapIds(characterId: bigint): Promise<bigint[]> {
  const rows = await db
    .select({ mapId: apMapCharacterTracking.mapId })
    .from(apMapCharacterTracking)
    .where(eq(apMapCharacterTracking.characterId, characterId))
    .orderBy(apMapCharacterTracking.mapId);
  return rows.map((r) => r.mapId);
}

describe.skipIf(!run)('Stage 17.5 tracking toggle (real Postgres)', () => {
  let userId = 0;
  let mapA = 0n;
  let mapB = 0n;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    // `trackCharactersOnMap` enqueues via `graphile_worker.add_job`.
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
    await db.delete(apJobRun).where(eq(apJobRun.name, 'location-poll'));
    await removeOwnPollJobs();
    await pool.end();
  });

  beforeEach(() => {
    mockedEsiCall.mockReset();
  });

  afterEach(async () => {
    await db.delete(apMapCharacterTracking).where(inArray(apMapCharacterTracking.characterId, [CHAR_A, CHAR_B]));
    await db
      .update(apCharacter)
      .set({ trackingEnabled: true, status: 'active' })
      .where(inArray(apCharacter.id, [CHAR_A, CHAR_B]));
    await db.delete(apJobRun).where(eq(apJobRun.name, 'location-poll'));
    await removeOwnPollJobs();
  });

  it('trackCharactersOnMap points every character at the map and moves them off others', async () => {
    // CHAR_A starts tracked on mapB (a previously-open map).
    await db.insert(apMapCharacterTracking).values({ mapId: mapB, characterId: CHAR_A });

    await trackCharactersOnMap([CHAR_A, CHAR_B], mapA);

    expect(await trackedMapIds(CHAR_A)).toEqual([mapA]); // moved off mapB
    expect(await trackedMapIds(CHAR_B)).toEqual([mapA]);

    // One location-poll job per character was enqueued (scoped to this test's
    // job keys so the dev queue's own polls don't skew the count).
    const countRows = (
      await db.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM graphile_worker.jobs WHERE key IN (${KEY_A}, ${KEY_B})`,
      )
    ).rows;
    expect(countRows[0]?.count).toBe(2);
  });

  it('stopAllTrackingForCharacter removes every tracking row for the character', async () => {
    await db.insert(apMapCharacterTracking).values([
      { mapId: mapA, characterId: CHAR_A },
      { mapId: mapB, characterId: CHAR_A },
      { mapId: mapA, characterId: CHAR_B },
    ]);

    await stopAllTrackingForCharacter(CHAR_A);

    expect(await trackedMapIds(CHAR_A)).toEqual([]);
    expect(await trackedMapIds(CHAR_B)).toEqual([mapA]); // untouched
  });

  it('location-poll exits with tracking-disabled when the flag is off', async () => {
    // A stale tracking row survives the moment between disable and the tick.
    await db.insert(apMapCharacterTracking).values({ mapId: mapA, characterId: CHAR_A });
    await db.update(apCharacter).set({ trackingEnabled: false }).where(eq(apCharacter.id, CHAR_A));

    const { helpers, captured } = makeHelpers();
    await locationPoll.run({ characterId: CHAR_A.toString() }, helpers);

    expect(await lastRunNotes()).toEqual({ stopped: 'tracking-disabled' });
    expect(captured).toHaveLength(0); // no re-enqueue
    expect(mockedEsiCall).not.toHaveBeenCalled(); // never reached the ESI phase
  });
});
