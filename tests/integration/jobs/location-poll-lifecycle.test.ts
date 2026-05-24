// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Job, JobHelpers, TaskSpec } from 'graphile-worker';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apJobRun,
  apMap,
  apMapCharacterTracking,
  apUser,
} from '@/db/schema';
import { apertureConfig } from '../../../aperture.config';

vi.mock('@/lib/esi/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/esi/client')>();
  return { ...actual, esiCall: vi.fn() };
});

import { esiCall, EsiBreakerOpenError, EsiTokenError } from '@/lib/esi/client';
import { locationPoll } from '@/lib/jobs/tasks/locationPoll';
import { bus } from '@/lib/realtime/bus';
import type { ServerToClientMessage } from '@/lib/realtime/protocol';

/**
 * Stage 12.3 gates per sub-stage plan:
 *   - Character status flip → handler exits cleanly without re-enqueue.
 *   - EsiTokenError → tracking rows for this character are removed; clean
 *     stop reason in `ap_job_run.notes`; no re-enqueue.
 *   - EsiBreakerOpenError → re-enqueue at the offline interval (success=false
 *     row).
 *   - `characterUpdate` envelope reaches the realtime bus on a location
 *     change (LISTEN smoke).
 *
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const CHAR_ID = 95000001n;
const JITA = 30000142;
const TARGET = 30000144;
const SHIP_TYPE = 670;

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

async function lastRun() {
  const [row] = await db
    .select()
    .from(apJobRun)
    .where(eq(apJobRun.name, 'location-poll'))
    .orderBy(desc(apJobRun.startedAt))
    .limit(1);
  return row;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!run)('Stage 12.3 location-poll lifecycle (real Postgres)', () => {
  let userId = 0;
  let mapId = 0n;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await db.delete(apJobRun).where(eq(apJobRun.name, 'location-poll'));
    await db.delete(apCharacter).where(eq(apCharacter.id, CHAR_ID));
    await db.delete(apMap).where(eq(apMap.name, 'lifecycle-test-map'));

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;
    await db.insert(apCharacter).values({
      id: CHAR_ID,
      userId,
      name: 'Lifecycle Test',
      ownerHash: 'oh-life',
    });
    const [m] = await db
      .insert(apMap)
      .values({ scope: 'all', type: 'private', name: 'lifecycle-test-map' })
      .returning({ id: apMap.id });
    mapId = m!.id;
  });

  afterAll(async () => {
    await db.delete(apJobRun).where(eq(apJobRun.name, 'location-poll'));
    await db.delete(apMapCharacterTracking).where(eq(apMapCharacterTracking.characterId, CHAR_ID));
    await db.delete(apCharacter).where(eq(apCharacter.id, CHAR_ID));
    await db.delete(apMap).where(eq(apMap.id, mapId));
    await pool.end();
  });

  beforeEach(() => {
    mockedEsiCall.mockReset();
  });

  afterEach(async () => {
    await db.delete(apMapCharacterTracking).where(eq(apMapCharacterTracking.characterId, CHAR_ID));
    await db
      .update(apCharacter)
      .set({
        status: 'active',
        lastSystemId: null,
        lastShipTypeId: null,
        lastOnline: null,
        lastLocationAt: null,
      })
      .where(eq(apCharacter.id, CHAR_ID));
    await db.delete(apJobRun).where(eq(apJobRun.name, 'location-poll'));
  });

  it('exits cleanly without re-enqueue when character status is kicked', async () => {
    await db.insert(apMapCharacterTracking).values({ mapId, characterId: CHAR_ID });
    await db.update(apCharacter).set({ status: 'kicked' }).where(eq(apCharacter.id, CHAR_ID));

    const { helpers, captured } = makeHelpers();
    await locationPoll.run({ characterId: CHAR_ID.toString() }, helpers);

    expect(captured).toHaveLength(0);
    expect(mockedEsiCall).not.toHaveBeenCalled();
    const row = await lastRun();
    expect(row!.success).toBe(true);
    expect(row!.notes).toEqual({ stopped: 'character-inactive' });

    // Tracking rows are intact — re-activation re-arms via startTrackingCharacter.
    const tracking = await db
      .select({ characterId: apMapCharacterTracking.characterId })
      .from(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.characterId, CHAR_ID));
    expect(tracking).toHaveLength(1);
  });

  it('on EsiTokenError, deletes the character\'s tracking rows and stops the loop', async () => {
    await db.insert(apMapCharacterTracking).values({ mapId, characterId: CHAR_ID });

    mockedEsiCall.mockImplementation(async () => {
      throw new EsiTokenError(CHAR_ID, new Error('refresh failed'));
    });

    const { helpers, captured } = makeHelpers();
    await locationPoll.run({ characterId: CHAR_ID.toString() }, helpers);

    expect(captured).toHaveLength(0); // no re-enqueue
    const row = await lastRun();
    expect(row!.success).toBe(true); // clean stop, not a failure
    expect(row!.notes).toEqual({ stopped: 'token-loss' });

    const tracking = await db
      .select({ characterId: apMapCharacterTracking.characterId })
      .from(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.characterId, CHAR_ID));
    expect(tracking).toHaveLength(0);
  });

  it('on EsiBreakerOpenError, re-enqueues at the offline cadence and records failure', async () => {
    await db.insert(apMapCharacterTracking).values({ mapId, characterId: CHAR_ID });

    mockedEsiCall.mockImplementation(async () => {
      throw new EsiBreakerOpenError('get_characters_character_id_online');
    });

    const { helpers, captured } = makeHelpers();
    await expect(
      locationPoll.run({ characterId: CHAR_ID.toString() }, helpers),
    ).rejects.toThrow(EsiBreakerOpenError);

    expect(captured).toHaveLength(1);
    const delayMs = (captured[0]!.spec!.runAt as Date).getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(apertureConfig.LOCATION_POLL_OFFLINE_MS - 1000);

    const row = await lastRun();
    expect(row!.success).toBe(false);

    // Tracking rows survive — the breaker is transient.
    const tracking = await db
      .select({ characterId: apMapCharacterTracking.characterId })
      .from(apMapCharacterTracking)
      .where(eq(apMapCharacterTracking.characterId, CHAR_ID));
    expect(tracking).toHaveLength(1);
  });

  it('emits a characterUpdate envelope on the bus when location is observed', async () => {
    await db.insert(apMapCharacterTracking).values({ mapId, characterId: CHAR_ID });
    await db.update(apCharacter).set({ lastSystemId: JITA }).where(eq(apCharacter.id, CHAR_ID));

    mockedEsiCall.mockImplementation(async (opKey) => {
      if (opKey === 'getCharacterOnline') return { online: true };
      if (opKey === 'getCharacterLocation') return { solar_system_id: TARGET };
      if (opKey === 'getCharacterShip') {
        return { ship_type_id: SHIP_TYPE, ship_item_id: 1, ship_name: 'Test' };
      }
      throw new Error(`unexpected opKey ${opKey}`);
    });

    // Subscribe BEFORE driving the tick. The bus issues LISTEN on the channel
    // and needs a beat to register before pg_notify hits.
    const received: ServerToClientMessage[] = [];
    const unsubscribe = bus.subscribe(mapId, (msg) => received.push(msg));
    await delay(200);

    await locationPoll.run({ characterId: CHAR_ID.toString() }, makeHelpers().helpers);

    // pg_notify is fire-and-forget across connections — wait a beat.
    await delay(500);
    unsubscribe();

    const characterUpdates = received.filter((m) => m.task === 'characterUpdate');
    expect(characterUpdates.length).toBeGreaterThanOrEqual(1);
    const last = characterUpdates.at(-1)!;
    if (last.task !== 'characterUpdate') throw new Error('expected characterUpdate');
    expect(last.load).toMatchObject({
      characterId: Number(CHAR_ID),
      online: true,
      systemId: TARGET,
      shipTypeId: SHIP_TYPE,
    });
    expect(typeof last.load.locationAt).toBe('string');
  });
});

// Silence unused-import noise (kept for symmetry with the other DB tests).
void inArray;
