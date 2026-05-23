// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db/client';
import {
  apMap,
  apMapConnection,
  apMapEvent,
  apMapSignature,
  apMapSystem,
  universeCategory,
  universeConstellation,
  universeGroup,
  universeRegion,
  universeSystem,
  universeType,
} from '@/db/schema';
import { addSystem } from '@/lib/map/mutations/systems';
import { createConnection } from '@/lib/map/mutations/connections';
import { createSignature } from '@/lib/map/mutations/signatures';
import { pasteSignatures } from '@/lib/map/mutations/bulkSignatures';
import type { ResolvedSigRow } from '@/lib/map/signatureReader';

/**
 * Stage 10.2 gate: bulk signature-paste orchestrator.
 * Verifies the diff/atomic-commit contract end-to-end against real Postgres.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const REGION = 98041001;
const CONSTELLATION = 98041001;
const SYSTEM_A = 98041002;
const SYSTEM_B = 98041003;
const CATEGORY = 98041001;
const GROUP_WORMHOLE = 98041001;
const GROUP_GAS = 98041002;
const TYPE_UNSTABLE = 98041001;
const TYPE_GAS_BARREN = 98041002;

let mapId = 0n;

describe.skipIf(!run)('bulk signature paste — diff / atomic commit (real Postgres)', () => {
  let mapSystemIdA = 0n;
  let mapSystemIdB = 0n;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    await db.insert(universeRegion).values({ id: REGION, name: 'Paste Test Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Paste Test Const' });
    await db.insert(universeSystem).values([
      { id: SYSTEM_A, constellationId: CONSTELLATION, name: 'J150001', security: 'C4' },
      { id: SYSTEM_B, constellationId: CONSTELLATION, name: 'J150002', security: 'C5' },
    ]);
    await db.insert(universeCategory).values({ id: CATEGORY, name: 'Paste Cat' });
    await db.insert(universeGroup).values([
      { id: GROUP_WORMHOLE, categoryId: CATEGORY, name: 'Wormhole' },
      { id: GROUP_GAS, categoryId: CATEGORY, name: 'Cosmic Signature' },
    ]);
    await db.insert(universeType).values([
      { id: TYPE_UNSTABLE, groupId: GROUP_WORMHOLE, name: 'Unstable Wormhole' },
      { id: TYPE_GAS_BARREN, groupId: GROUP_GAS, name: 'Barren Reservoir' },
    ]);

    const [m] = await db
      .insert(apMap)
      .values({ name: 'Bulk Paste Test Map', scope: 'all', type: 'private' })
      .returning({ id: apMap.id });
    mapId = m!.id;

    const resA = await addSystem({ mapId, systemId: SYSTEM_A, characterId: null });
    expect(resA.ok).toBe(true);
    const resB = await addSystem({ mapId, systemId: SYSTEM_B, characterId: null });
    expect(resB.ok).toBe(true);
    mapSystemIdA = BigInt((resA as { ok: true; data: { id: string } }).data.id);
    mapSystemIdB = BigInt((resB as { ok: true; data: { id: string } }).data.id);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('diff: adds new, updates classification, removes missing — one event per affected sig', async () => {
    // Seed two existing sigs: ABC-001 (classified) and DEF-002 (unclassified).
    const seed1 = await createSignature({
      mapId,
      mapSystemId: mapSystemIdA,
      characterId: null,
      sigId: 'ABC-001',
      groupId: null,
      typeId: null,
      name: 'preserve me',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(seed1.ok).toBe(true);
    const seed2 = await createSignature({
      mapId,
      mapSystemId: mapSystemIdA,
      characterId: null,
      sigId: 'DEF-002',
      groupId: null,
      typeId: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(seed2.ok).toBe(true);

    const beforeEvents = await eventCount();

    // Paste: ABC-001 newly classified, GHI-003 new, JKL-004 new; DEF-002 absent.
    const rows: ResolvedSigRow[] = [
      {
        sigId: 'ABC-001',
        name: 'Unstable Wormhole',
        groupName: 'Wormhole',
        signal: '100.0%',
        groupId: GROUP_WORMHOLE,
        typeId: TYPE_UNSTABLE,
      },
      {
        sigId: 'GHI-003',
        name: 'Barren Reservoir',
        groupName: 'Cosmic Signature',
        signal: '100.0%',
        groupId: GROUP_GAS,
        typeId: TYPE_GAS_BARREN,
      },
      {
        sigId: 'JKL-004',
        name: null,
        groupName: null,
        signal: '4.2%',
        groupId: null,
        typeId: null,
      },
    ];

    const result = await pasteSignatures({
      mapId,
      mapSystemId: mapSystemIdA,
      characterId: null,
      rows,
      options: {
        addMissing: true,
        updateExisting: true,
        removeMissing: true,
        removeOrphanedConnections: false,
      },
      defaultExpiresAt: new Date(Date.now() + 86_400_000),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2 new + 1 update + 1 delete = 4 events.
    expect(result.data.summary).toEqual({
      added: 2,
      updated: 1,
      removed: 1,
      connectionsRemoved: 0,
    });
    expect(await eventCount()).toBe(beforeEvents + 4);
    expect(result.data.payloads).toHaveLength(4);

    // Existing classified row preserved its name, gained groupId/typeId.
    const [abc] = await db
      .select({
        sigId: apMapSignature.sigId,
        name: apMapSignature.name,
        groupId: apMapSignature.groupId,
        typeId: apMapSignature.typeId,
      })
      .from(apMapSignature)
      .where(eq(apMapSignature.mapSystemId, mapSystemIdA));
    expect(abc).toBeDefined();

    const finalSigs = await db
      .select({
        sigId: apMapSignature.sigId,
        name: apMapSignature.name,
        groupId: apMapSignature.groupId,
      })
      .from(apMapSignature)
      .where(eq(apMapSignature.mapSystemId, mapSystemIdA));
    const sigIds = finalSigs.map((s) => s.sigId).sort();
    expect(sigIds).toEqual(['ABC-001', 'GHI-003', 'JKL-004']);

    const abcRow = finalSigs.find((s) => s.sigId === 'ABC-001');
    expect(abcRow).toMatchObject({
      name: 'preserve me', // unchanged — paste shouldn't clobber name
      groupId: GROUP_WORMHOLE,
    });

    // Clean for the next test.
    await db
      .delete(apMapSignature)
      .where(eq(apMapSignature.mapSystemId, mapSystemIdA));
  });

  it('removeOrphanedConnections: also emits connection.delete for sigs bound to a connection', async () => {
    // Seed a connection from A to B and a sig on A bound to it.
    const conn = await createConnection({
      mapId,
      characterId: null,
      sourceMapSystemId: mapSystemIdA,
      targetMapSystemId: mapSystemIdB,
      scope: 'wh',
    });
    expect(conn.ok).toBe(true);
    const connectionId = BigInt((conn as { ok: true; data: { id: string } }).data.id);

    const sig = await createSignature({
      mapId,
      mapSystemId: mapSystemIdA,
      characterId: null,
      sigId: 'WHA-001',
      mapConnectionId: connectionId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(sig.ok).toBe(true);

    const beforeEvents = await eventCount();

    const result = await pasteSignatures({
      mapId,
      mapSystemId: mapSystemIdA,
      characterId: null,
      rows: [], // empty paste → existing sig disappears
      options: {
        addMissing: true,
        updateExisting: true,
        removeMissing: true,
        removeOrphanedConnections: true,
      },
      defaultExpiresAt: new Date(Date.now() + 86_400_000),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary).toEqual({
      added: 0,
      updated: 0,
      removed: 1,
      connectionsRemoved: 1,
    });
    // 1 signature.delete + 1 connection.delete.
    expect(await eventCount()).toBe(beforeEvents + 2);

    // The connection row is gone.
    const conns = await db
      .select({ id: apMapConnection.id })
      .from(apMapConnection)
      .where(eq(apMapConnection.id, connectionId));
    expect(conns).toHaveLength(0);
  });

  it('rollback: a duplicate sigId in the same paste aborts the whole batch', async () => {
    // Empty state, then a paste with two new sigs and one accidental duplicate.
    const beforeEvents = await eventCount();
    const beforeRows = await sigCount();

    const rows: ResolvedSigRow[] = [
      // The dedupe-by-sigId logic keeps the last occurrence, so a true duplicate
      // collapses to one row. Force a unique-constraint violation by pre-seeding
      // a sig with the same sigId, then attempting to add it again via paste.
      {
        sigId: 'DUP-001',
        name: null,
        groupName: null,
        signal: '100.0%',
        groupId: null,
        typeId: null,
      },
    ];

    // Seed the conflicting sig.
    const seed = await createSignature({
      mapId,
      mapSystemId: mapSystemIdA,
      characterId: null,
      sigId: 'DUP-001',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(seed.ok).toBe(true);

    // Now ask pasteSignatures to ADD it again (updateExisting off so the
    // create path runs) — should hit the (mapSystemId, sigId) unique constraint
    // and roll back. Two other rows in the batch should not persist.
    const conflict = await pasteSignatures({
      mapId,
      mapSystemId: mapSystemIdA,
      characterId: null,
      rows: [
        ...rows,
        {
          sigId: 'OK1-001',
          name: null,
          groupName: null,
          signal: '100%',
          groupId: null,
          typeId: null,
        },
        {
          sigId: 'OK2-001',
          name: null,
          groupName: null,
          signal: '100%',
          groupId: null,
          typeId: null,
        },
      ],
      options: {
        addMissing: true,
        updateExisting: false, // skip the update path so DUP-001 hits create
        removeMissing: false,
        removeOrphanedConnections: false,
      },
      defaultExpiresAt: new Date(Date.now() + 86_400_000),
    });

    expect(conflict.ok).toBe(false);
    // No new events (the seeded sig's create event is from before, but no events
    // beyond that since the batch rolled back wholesale).
    expect(await eventCount()).toBe(beforeEvents + 1);
    // Only the seeded sig persists; OK1 / OK2 rolled back.
    expect(await sigCount()).toBe(beforeRows + 1);
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

async function eventCount(): Promise<number> {
  const rows = (
    await db.execute(sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${mapId}`)
  ).rows as Array<{ count: number }>;
  return rows[0]!.count;
}

async function sigCount(): Promise<number> {
  const rows = (
    await db.execute(
      sql`SELECT count(*)::int AS count FROM ap_map_signature WHERE map_system_id IN (
        SELECT id FROM ap_map_system WHERE map_id = ${mapId}
      )`,
    )
  ).rows as Array<{ count: number }>;
  return rows[0]!.count;
}

async function cleanup() {
  if (mapId) {
    await db
      .delete(apMapSignature)
      .where(
        sql`${apMapSignature.mapSystemId} IN (
          SELECT id FROM ap_map_system WHERE map_id = ${mapId}
        )`,
      );
    await db.delete(apMapConnection).where(eq(apMapConnection.mapId, mapId));
    await db.delete(apMapSystem).where(eq(apMapSystem.mapId, mapId));
    await db.delete(apMapEvent).where(eq(apMapEvent.mapId, mapId));
    await db.delete(apMap).where(eq(apMap.id, mapId));
  }
  await db.delete(apMap).where(eq(apMap.name, 'Bulk Paste Test Map'));
  await db
    .delete(universeType)
    .where(inArray(universeType.id, [TYPE_UNSTABLE, TYPE_GAS_BARREN]));
  await db
    .delete(universeGroup)
    .where(inArray(universeGroup.id, [GROUP_WORMHOLE, GROUP_GAS]));
  await db.delete(universeCategory).where(eq(universeCategory.id, CATEGORY));
  await db.delete(universeSystem).where(inArray(universeSystem.id, [SYSTEM_A, SYSTEM_B]));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
