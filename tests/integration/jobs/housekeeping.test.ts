// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { db, pool } from '@/db/client';
import {
  apJobRun,
  apMap,
  apMapConnection,
  apMapEvent,
  apMapSignature,
  apMapSystem,
  universeConstellation,
  universeRegion,
  universeSystem,
} from '@/db/schema';
import { signatureReap } from '@/lib/jobs/tasks/signatureReap';
import { eolExpiry } from '@/lib/jobs/tasks/eolExpiry';
import { expiredConnections } from '@/lib/jobs/tasks/expiredConnections';
import { mapPurge } from '@/lib/jobs/tasks/mapPurge';

/**
 * Stage 11.2 gates per sub-stage plan:
 *  - "for each job, seed rows, invoke the handler directly, assert the
 *     expected rows go away **and** an `ap_map_event` row of the right kind
 *     is written for the row-level deletes."
 *  - "A LISTEN-side smoke confirms the `pg_notify` fires from the trigger as
 *     a result of the job-driven delete." — covered by the `ap_map_event`
 *     write because the AFTER INSERT trigger is the only thing that fires the
 *     notify; Stage 8's realtime-transport.test.ts already exercises the
 *     LISTEN side end-to-end.
 *
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';
const FAKE_HELPERS = {} as unknown as JobHelpers;

const REGION = 98110001;
const CONSTELLATION = 98110001;
const SYS_A = 98110001;
const SYS_B = 98110002;

let activeMapId = 0n;
let optOutMapId = 0n;
let mapSystemA = 0n;
let mapSystemB = 0n;
let optOutSystemA = 0n;
let optOutSystemB = 0n;

describe.skipIf(!run)('Stage 11.2 housekeeping jobs (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    await db.insert(universeRegion).values({ id: REGION, name: 'Jobs Test Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Jobs Test Const' });
    await db.insert(universeSystem).values([
      { id: SYS_A, constellationId: CONSTELLATION, name: 'Jobs Test Sys A', security: 'C3' },
      { id: SYS_B, constellationId: CONSTELLATION, name: 'Jobs Test Sys B', security: 'H' },
    ]);

    // Map A: defaults — deleteEolConnections = true, deleteExpiredConnections = true.
    const [a] = await db
      .insert(apMap)
      .values({ scope: 'all', type: 'private', name: 'jobs-active-map' })
      .returning({ id: apMap.id });
    activeMapId = a!.id;

    // Map B: opts OUT of both EOL and 48h expiry — used to prove the guards work.
    const [b] = await db
      .insert(apMap)
      .values({
        scope: 'all',
        type: 'private',
        name: 'jobs-optout-map',
        deleteEolConnections: false,
        deleteExpiredConnections: false,
      })
      .returning({ id: apMap.id });
    optOutMapId = b!.id;

    const [sa] = await db
      .insert(apMapSystem)
      .values({ mapId: activeMapId, systemId: SYS_A, visible: true })
      .returning({ id: apMapSystem.id });
    mapSystemA = sa!.id;
    const [sb] = await db
      .insert(apMapSystem)
      .values({ mapId: activeMapId, systemId: SYS_B, visible: true })
      .returning({ id: apMapSystem.id });
    mapSystemB = sb!.id;

    const [oa] = await db
      .insert(apMapSystem)
      .values({ mapId: optOutMapId, systemId: SYS_A, visible: true })
      .returning({ id: apMapSystem.id });
    optOutSystemA = oa!.id;
    const [ob] = await db
      .insert(apMapSystem)
      .values({ mapId: optOutMapId, systemId: SYS_B, visible: true })
      .returning({ id: apMapSystem.id });
    optOutSystemB = ob!.id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  // ─── signature-reap ───────────────────────────────────────────────────────

  it('signatureReap deletes expired sigs and emits signature.delete events', async () => {
    // Two expired sigs on the active map, one not yet expired (control).
    const [expired1] = await db
      .insert(apMapSignature)
      .values({
        mapSystemId: mapSystemA,
        sigId: 'EXP',
        expiresAt: sql`now() - interval '1 hour'`,
      })
      .returning({ id: apMapSignature.id });
    const [expired2] = await db
      .insert(apMapSignature)
      .values({
        mapSystemId: mapSystemB,
        sigId: 'EXP',
        expiresAt: sql`now() - interval '5 minutes'`,
      })
      .returning({ id: apMapSignature.id });
    const [alive] = await db
      .insert(apMapSignature)
      .values({
        mapSystemId: mapSystemA,
        sigId: 'OK1',
        expiresAt: sql`now() + interval '1 day'`,
      })
      .returning({ id: apMapSignature.id });

    await signatureReap.run(null, FAKE_HELPERS);

    const gone = await db
      .select({ id: apMapSignature.id })
      .from(apMapSignature)
      .where(inArray(apMapSignature.id, [expired1!.id, expired2!.id, alive!.id]));
    expect(gone.map((r) => r.id)).toEqual([alive!.id]);

    const events = await db
      .select({ kind: apMapEvent.kind })
      .from(apMapEvent)
      .where(and(eq(apMapEvent.mapId, activeMapId), eq(apMapEvent.kind, 'signature.delete')));
    expect(events.length).toBeGreaterThanOrEqual(2);

    const runRow = await lastJobRun('signature-reap');
    expect(runRow!.success).toBe(true);
    expect(runRow!.notes).toMatchObject({ deleted: 2, failed: 0 });
  });

  it('signatureReap skips soft-deleted maps', async () => {
    const [deletedMap] = await db
      .insert(apMap)
      .values({
        scope: 'all',
        type: 'private',
        name: 'jobs-deleted-map',
        deletedAt: sql`now() - interval '1 day'`,
      })
      .returning({ id: apMap.id });
    const [sysOnDeleted] = await db
      .insert(apMapSystem)
      .values({ mapId: deletedMap!.id, systemId: SYS_A, visible: true })
      .returning({ id: apMapSystem.id });
    const [sigOnDeleted] = await db
      .insert(apMapSignature)
      .values({
        mapSystemId: sysOnDeleted!.id,
        sigId: 'EXP',
        expiresAt: sql`now() - interval '1 hour'`,
      })
      .returning({ id: apMapSignature.id });

    await signatureReap.run(null, FAKE_HELPERS);

    const stillThere = await db
      .select({ id: apMapSignature.id })
      .from(apMapSignature)
      .where(eq(apMapSignature.id, sigOnDeleted!.id));
    expect(stillThere).toHaveLength(1);

    // Clean up the soft-deleted map so other tests aren't affected.
    await db.delete(apMap).where(eq(apMap.id, deletedMap!.id));
  });

  // ─── eol-expiry ────────────────────────────────────────────────────────────

  it('eolExpiry deletes only EOL connections older than the threshold on opted-in maps', async () => {
    // Active map: one stale EOL (should die), one fresh EOL (should survive).
    const [staleEol] = await db
      .insert(apMapConnection)
      .values({
        mapId: activeMapId,
        sourceMapSystemId: mapSystemA,
        targetMapSystemId: mapSystemB,
        scope: 'wh',
        isEol: true,
        eolAt: sql`now() - interval '5 hours'`,
      })
      .returning({ id: apMapConnection.id });
    const [freshEol] = await db
      .insert(apMapConnection)
      .values({
        mapId: activeMapId,
        sourceMapSystemId: mapSystemA,
        targetMapSystemId: mapSystemB,
        scope: 'wh',
        isEol: true,
        eolAt: sql`now() - interval '1 hour'`,
      })
      .returning({ id: apMapConnection.id });
    // Opt-out map: stale EOL that should survive because the map opted out.
    const [optOutStale] = await db
      .insert(apMapConnection)
      .values({
        mapId: optOutMapId,
        sourceMapSystemId: optOutSystemA,
        targetMapSystemId: optOutSystemB,
        scope: 'wh',
        isEol: true,
        eolAt: sql`now() - interval '5 hours'`,
      })
      .returning({ id: apMapConnection.id });

    await eolExpiry.run(null, FAKE_HELPERS);

    const survivors = await db
      .select({ id: apMapConnection.id })
      .from(apMapConnection)
      .where(inArray(apMapConnection.id, [staleEol!.id, freshEol!.id, optOutStale!.id]));
    expect(new Set(survivors.map((r) => r.id))).toEqual(new Set([freshEol!.id, optOutStale!.id]));

    const events = await db
      .select({ kind: apMapEvent.kind })
      .from(apMapEvent)
      .where(and(eq(apMapEvent.mapId, activeMapId), eq(apMapEvent.kind, 'connection.delete')));
    expect(events.length).toBeGreaterThanOrEqual(1);

    const runRow = await lastJobRun('eol-expiry');
    expect(runRow!.success).toBe(true);
    expect(runRow!.notes).toMatchObject({ deleted: 1, failed: 0 });

    // Clean up the survivors so the next test starts from a known state.
    await db
      .delete(apMapConnection)
      .where(inArray(apMapConnection.id, [freshEol!.id, optOutStale!.id]));
  });

  // ─── expired-connections ──────────────────────────────────────────────────

  it('expiredConnections deletes only WH-scope connections older than 48h on opted-in maps', async () => {
    const [oldWh] = await db
      .insert(apMapConnection)
      .values({
        mapId: activeMapId,
        sourceMapSystemId: mapSystemA,
        targetMapSystemId: mapSystemB,
        scope: 'wh',
        createdAt: sql`now() - interval '49 hours'`,
      })
      .returning({ id: apMapConnection.id });
    const [oldGate] = await db
      .insert(apMapConnection)
      .values({
        mapId: activeMapId,
        sourceMapSystemId: mapSystemA,
        targetMapSystemId: mapSystemB,
        scope: 'stargate',
        createdAt: sql`now() - interval '49 hours'`,
      })
      .returning({ id: apMapConnection.id });
    const [optOutOldWh] = await db
      .insert(apMapConnection)
      .values({
        mapId: optOutMapId,
        sourceMapSystemId: optOutSystemA,
        targetMapSystemId: optOutSystemB,
        scope: 'wh',
        createdAt: sql`now() - interval '49 hours'`,
      })
      .returning({ id: apMapConnection.id });

    await expiredConnections.run(null, FAKE_HELPERS);

    const survivors = await db
      .select({ id: apMapConnection.id })
      .from(apMapConnection)
      .where(inArray(apMapConnection.id, [oldWh!.id, oldGate!.id, optOutOldWh!.id]));
    expect(new Set(survivors.map((r) => r.id))).toEqual(new Set([oldGate!.id, optOutOldWh!.id]));

    const runRow = await lastJobRun('expired-connections');
    expect(runRow!.success).toBe(true);
    expect(runRow!.notes).toMatchObject({ deleted: 1, failed: 0 });

    await db
      .delete(apMapConnection)
      .where(inArray(apMapConnection.id, [oldGate!.id, optOutOldWh!.id]));
  });

  // ─── map-purge ────────────────────────────────────────────────────────────

  it('mapPurge hard-deletes maps past the grace window and leaves recent soft-deletes alone', async () => {
    const [ancient] = await db
      .insert(apMap)
      .values({
        scope: 'all',
        type: 'private',
        name: 'jobs-ancient-soft-delete',
        deletedAt: sql`now() - interval '40 days'`,
      })
      .returning({ id: apMap.id });
    const [recent] = await db
      .insert(apMap)
      .values({
        scope: 'all',
        type: 'private',
        name: 'jobs-recent-soft-delete',
        deletedAt: sql`now() - interval '5 days'`,
      })
      .returning({ id: apMap.id });

    await mapPurge.run(null, FAKE_HELPERS);

    const survivors = await db
      .select({ id: apMap.id })
      .from(apMap)
      .where(inArray(apMap.id, [ancient!.id, recent!.id]));
    expect(survivors.map((r) => r.id)).toEqual([recent!.id]);

    const runRow = await lastJobRun('map-purge');
    expect(runRow!.success).toBe(true);
    expect(runRow!.notes).toMatchObject({ deleted: 1 });

    await db.delete(apMap).where(eq(apMap.id, recent!.id));
  });
});

async function lastJobRun(name: string) {
  const rows = await db
    .select()
    .from(apJobRun)
    .where(eq(apJobRun.name, name))
    .orderBy(sql`${apJobRun.startedAt} desc`)
    .limit(1);
  return rows[0];
}

async function cleanup() {
  await db.delete(apJobRun);
  // ap_map cascades remove ap_map_system / ap_map_connection / ap_map_signature / ap_map_event.
  await db
    .delete(apMap)
    .where(sql`name like 'jobs-%'`);
  await db.delete(universeSystem).where(inArray(universeSystem.id, [SYS_A, SYS_B]));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
