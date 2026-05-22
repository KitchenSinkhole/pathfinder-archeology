// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db/client';
import {
  apMap,
  apMapConnection,
  apMapSystem,
  universeCategory,
  universeConstellation,
  universeGroup,
  universeRegion,
  universeSystem,
  universeSystemStatic,
  universeType,
  universeWormhole,
} from '@/db/schema';
import {
  addSystem,
  removeSystem,
  updateSystem,
} from '@/lib/map/mutations/systems';
import {
  createConnection,
  deleteConnection,
  updateConnection,
} from '@/lib/map/mutations/connections';
import { staticMatchForConnection, wormholeTypesForSystem } from '@/lib/map/wormholeTypes';
import { mapEventPayloadSchema } from '@/lib/realtime/protocol';

/**
 * Stage 9.2 gate. DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 *
 * Drives each system/connection helper against real Postgres and asserts row
 * state + exactly one `ap_map_event` per call + payload shape, and checks the
 * wormhole-catalog filters return class-correct codes (incl. the K162 universal).
 */
const run = process.env.RUN_DB_TESTS === '1';

const REGION = 98030001;
const CONSTELLATION = 98030001;
const C3 = 98030003; // a C3 wormhole system (security label 'C3')
const HS = 98030004; // a high-sec system (security label 'H')
const CATEGORY = 98030001;
const GROUP = 98030001;
// Wormhole catalog rows:
const WH_C3_HS = 98030010; // source C3 → target H  (a C3 system's static into hi-sec)
const WH_K162 = 98030011; // K162 universal: source NULL, target NULL
const WH_C5 = 98030012; // source C5 → should NOT appear for a C3 system

let mapId = 0n;

describe.skipIf(!run)('system & connection mutations (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    await db.insert(universeRegion).values({ id: REGION, name: 'Mut Test Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Mut Test Const' });
    await db.insert(universeSystem).values([
      { id: C3, constellationId: CONSTELLATION, name: 'J130003', security: 'C3' },
      { id: HS, constellationId: CONSTELLATION, name: 'Mut HS', security: 'H' },
    ]);

    await db.insert(universeCategory).values({ id: CATEGORY, name: 'Mut Cat' });
    await db.insert(universeGroup).values({ id: GROUP, categoryId: CATEGORY, name: 'Mut Grp' });
    await db.insert(universeType).values([
      { id: WH_C3_HS, groupId: GROUP, name: 'WH C3HS' },
      { id: WH_K162, groupId: GROUP, name: 'WH K162' },
      { id: WH_C5, groupId: GROUP, name: 'WH C5' },
    ]);
    await db.insert(universeWormhole).values([
      { typeId: WH_C3_HS, name: 'X877', sourceClass: 'C3', targetClass: 'H' },
      { typeId: WH_K162, name: 'K162', sourceClass: null, targetClass: null },
      { typeId: WH_C5, name: 'M555', sourceClass: 'C5', targetClass: 'C3' },
    ]);
    // The C3 system has a static (X877) leading to hi-sec.
    await db.insert(universeSystemStatic).values({ systemId: C3, typeId: WH_C3_HS });

    const [map] = await db
      .insert(apMap)
      .values({ name: 'Mut Test Map', scope: 'all', type: 'private' })
      .returning({ id: apMap.id });
    mapId = map!.id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('addSystem inserts a visible row and emits one system.added event', async () => {
    const before = await eventCount();
    const result = await addSystem({ mapId, systemId: C3, characterId: null, positionX: 5, positionY: 7 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => mapEventPayloadSchema.parse(result.data)).not.toThrow();
    expect(result.data).toMatchObject({ kind: 'system.added', systemId: C3, statics: ['X877'] });
    expect(await eventCount()).toBe(before + 1);

    const [row] = await db
      .select({ visible: apMapSystem.visible, posX: apMapSystem.positionX })
      .from(apMapSystem)
      .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.systemId, C3)));
    expect(row).toMatchObject({ visible: true, posX: 5 });
  });

  it('updateSystem writes only the patched fields and echoes them', async () => {
    const sysId = await mapSystemId(C3);
    const result = await updateSystem({
      mapId,
      mapSystemId: sysId,
      characterId: null,
      patch: { status: 'hostile', alias: 'Home', locked: true },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      kind: 'system.updated',
      eventId: result.eventId,
      id: sysId.toString(),
      status: 'hostile',
      alias: 'Home',
      locked: true,
    });

    const [row] = await db
      .select({ status: apMapSystem.status, alias: apMapSystem.alias, locked: apMapSystem.locked })
      .from(apMapSystem)
      .where(eq(apMapSystem.id, sysId));
    expect(row).toMatchObject({ status: 'hostile', alias: 'Home', locked: true });
  });

  it('removeSystem flips visible=false (row persists) then re-add preserves intel', async () => {
    const sysId = await mapSystemId(C3);

    const removed = await removeSystem({ mapId, mapSystemId: sysId, characterId: null });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.data).toEqual({ kind: 'system.removed', eventId: removed.eventId, id: sysId.toString() });
    const [hidden] = await db
      .select({ visible: apMapSystem.visible, alias: apMapSystem.alias })
      .from(apMapSystem)
      .where(eq(apMapSystem.id, sysId));
    expect(hidden).toMatchObject({ visible: false, alias: 'Home' });

    // Re-add reuses the same row: visible flips back, alias survives.
    const readded = await addSystem({ mapId, systemId: C3, characterId: null });
    expect(readded.ok).toBe(true);
    if (!readded.ok) return;
    expect(readded.data).toMatchObject({ kind: 'system.added', id: sysId.toString(), alias: 'Home' });
    const rows = await db
      .select({ id: apMapSystem.id })
      .from(apMapSystem)
      .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.systemId, C3)));
    expect(rows).toHaveLength(1); // no duplicate row
  });

  it('createConnection / updateConnection (EOL) / deleteConnection round-trip', async () => {
    const sourceId = await mapSystemId(C3);
    const targetRes = await addSystem({ mapId, systemId: HS, characterId: null });
    expect(targetRes.ok).toBe(true);
    const targetId = await mapSystemId(HS);

    const created = await createConnection({
      mapId,
      characterId: null,
      sourceMapSystemId: sourceId,
      targetMapSystemId: targetId,
      scope: 'wh',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data).toMatchObject({
      kind: 'connection.create',
      source: sourceId.toString(),
      target: targetId.toString(),
      scope: 'wh',
      massStatus: 'fresh',
      isEol: false,
    });
    const connId = BigInt((created.data as { id: string }).id);

    const eolBefore = await eventCount();
    const updated = await updateConnection({
      mapId,
      connectionId: connId,
      characterId: null,
      patch: { isEol: true, massStatus: 'critical' },
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data).toMatchObject({ kind: 'connection.update', isEol: true, massStatus: 'critical' });
    expect((updated.data as { eolAt: string }).eolAt).toBeTruthy();
    expect(await eventCount()).toBe(eolBefore + 1);
    const [conn] = await db
      .select({ isEol: apMapConnection.isEol, eolAt: apMapConnection.eolAt })
      .from(apMapConnection)
      .where(eq(apMapConnection.id, connId));
    expect(conn!.isEol).toBe(true);
    expect(conn!.eolAt).toBeInstanceOf(Date);

    const deleted = await deleteConnection({ mapId, connectionId: connId, characterId: null });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.data).toEqual({ kind: 'connection.delete', eventId: deleted.eventId, id: connId.toString() });
    const remaining = await db
      .select({ id: apMapConnection.id })
      .from(apMapConnection)
      .where(eq(apMapConnection.id, connId));
    expect(remaining).toHaveLength(0); // hard delete
  });

  it('wormholeTypesForSystem returns class-correct codes plus K162', async () => {
    // Invariant-based: the real seeded catalog is also present, so assert the
    // filter rule rather than an exact set.
    const types = await wormholeTypesForSystem(C3);
    expect(types.every((t) => t.sourceClass === null || t.sourceClass === 'C3')).toBe(true);
    const names = types.map((t) => t.name);
    expect(names).toContain('X877'); // our C3-source row
    expect(names).toContain('K162'); // null-source universal (appears anywhere)
    expect(names).not.toContain('M555'); // our C5-source row — excluded for a C3 system
  });

  it('staticMatchForConnection matches the source system static by target class', async () => {
    const matches = await staticMatchForConnection({ sourceSystemId: C3, targetSystemId: HS });
    expect(matches).toEqual([{ typeId: WH_C3_HS, name: 'X877', targetClass: 'H' }]);

    // C3→C3 has no matching static.
    const none = await staticMatchForConnection({ sourceSystemId: C3, targetSystemId: C3 });
    expect(none).toEqual([]);
  });
});

async function eventCount(): Promise<number> {
  const rows = (
    await db.execute(sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${mapId}`)
  ).rows as Array<{ count: number }>;
  return rows[0]!.count;
}

async function mapSystemId(systemId: number): Promise<bigint> {
  const [row] = await db
    .select({ id: apMapSystem.id })
    .from(apMapSystem)
    .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.systemId, systemId)));
  return row!.id;
}

async function cleanup() {
  if (mapId) await db.delete(apMap).where(eq(apMap.id, mapId));
  await db.delete(apMap).where(eq(apMap.name, 'Mut Test Map'));
  await db.delete(universeSystemStatic).where(eq(universeSystemStatic.systemId, C3));
  await db
    .delete(universeWormhole)
    .where(inArray(universeWormhole.typeId, [WH_C3_HS, WH_K162, WH_C5]));
  await db.delete(universeType).where(inArray(universeType.id, [WH_C3_HS, WH_K162, WH_C5]));
  await db.delete(universeGroup).where(eq(universeGroup.id, GROUP));
  await db.delete(universeCategory).where(eq(universeCategory.id, CATEGORY));
  await db.delete(universeSystem).where(inArray(universeSystem.id, [C3, HS]));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
