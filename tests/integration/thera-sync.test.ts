// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// EVE-Scout is mocked so `loadTheraConnections` is deterministic and offline.
// `syncTheraConnections` doesn't touch EVE-Scout (it takes explicit rows), so
// it exercises the real fold path against Postgres.
vi.mock('@/lib/integrations/evescout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/evescout')>();
  return {
    ...actual,
    fetchEveScoutConnections: vi.fn(async () => [
      // source is the hub (Thera).
      {
        sourceName: 'Thera',
        sourceSystemId: 98044005,
        targetName: 'J160100',
        targetSystemId: 98044002,
        signatureId: 'ABC',
        hub: 'Thera' as const,
        updatedAt: null,
        expiresAt: null,
      },
      // hub is on the TARGET side — orientation must flip.
      {
        sourceName: 'Hub Target K',
        sourceSystemId: 98044003,
        targetName: 'Turnur',
        targetSystemId: 98044006,
        signatureId: 'DEF',
        hub: 'Turnur' as const,
        updatedAt: null,
        expiresAt: null,
      },
      // unresolved target id — must be dropped (can't sync to a real system).
      {
        sourceName: 'Thera',
        sourceSystemId: 98044005,
        targetName: 'Unknown',
        targetSystemId: null,
        signatureId: 'GHI',
        hub: 'Thera' as const,
        updatedAt: null,
        expiresAt: null,
      },
    ]),
  };
});

import { db, pool } from '@/db/client';
import {
  apMap,
  apMapConnection,
  apMapEvent,
  apMapSystem,
  universeConstellation,
  universeRegion,
  universeSystem,
} from '@/db/schema';
import { loadTheraConnections, syncTheraConnections } from '@/lib/map/thera';

/**
 * Stage 17.9 gate: Thera/Turnur sync onto a map + the read-side orientation.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const REGION = 98044001;
const CONSTELLATION = 98044001;
const TARGET_A = 98044002; // C3 wormhole
const TARGET_K = 98044003; // k-space target (flipped row)
const THERA = 98044005;
const TURNUR = 98044006;

const MAP_NAME = 'Thera Sync Test Map';
let mapId = 0n;

describe.skipIf(!run)('thera sync — fold + orientation (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    await db.insert(universeRegion).values({ id: REGION, name: 'Thera Test Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Thera Test Const' });
    await db.insert(universeSystem).values([
      { id: THERA, constellationId: CONSTELLATION, name: 'Thera', security: 'C3' },
      { id: TURNUR, constellationId: CONSTELLATION, name: 'Turnur', security: 'L' },
      { id: TARGET_A, constellationId: CONSTELLATION, name: 'J160100', security: 'C3' },
      { id: TARGET_K, constellationId: CONSTELLATION, name: 'Hek', security: 'H' },
    ]);

    const [m] = await db
      .insert(apMap)
      .values({ name: MAP_NAME, scope: 'all', type: 'private' })
      .returning({ id: apMap.id });
    mapId = m!.id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('loadTheraConnections: orients hub→target and enriches target class, dropping null ids', async () => {
    const rows = await loadTheraConnections();
    expect(rows).toHaveLength(2);

    const thera = rows.find((r) => r.hub === 'Thera')!;
    expect(thera).toMatchObject({
      hubSystemId: THERA,
      targetSystemId: TARGET_A,
      targetName: 'J160100',
      securityClass: 'C3',
    });

    // The flipped row: hub was on the target side, so orientation puts Turnur as hub.
    const turnur = rows.find((r) => r.hub === 'Turnur')!;
    // targetName is EVE-Scout's name for the non-hub side; securityClass is
    // enriched from our universe_system by targetSystemId.
    expect(turnur).toMatchObject({
      hubSystemId: TURNUR,
      targetSystemId: TARGET_K,
      targetName: 'Hub Target K',
      securityClass: 'H',
    });
  });

  it('syncTheraConnections: adds hub + targets + connections, then is idempotent', async () => {
    const connections = [
      { hubSystemId: THERA, hubName: 'Thera', targetSystemId: TARGET_A, signatureId: 'ABC' },
      { hubSystemId: THERA, hubName: 'Thera', targetSystemId: TARGET_K, signatureId: 'XYZ' },
    ];

    const first = await syncTheraConnections({ mapId, characterId: null, connections });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // Hub + 2 targets added, 2 connections created.
    expect(first.data.summary).toEqual({ systems: 3, connections: 2 });
    expect(first.data.payloads).toHaveLength(5);

    const systems = await db
      .select({ systemId: apMapSystem.systemId })
      .from(apMapSystem)
      .where(eq(apMapSystem.mapId, mapId));
    expect(new Set(systems.map((s) => s.systemId))).toEqual(new Set([THERA, TARGET_A, TARGET_K]));

    const conns = await db
      .select({ scope: apMapConnection.scope, massStatus: apMapConnection.massStatus })
      .from(apMapConnection)
      .where(eq(apMapConnection.mapId, mapId));
    expect(conns).toHaveLength(2);
    expect(conns.every((c) => c.scope === 'wh' && c.massStatus === 'fresh')).toBe(true);

    // Re-syncing the same set is a no-op — no duplicate systems or edges.
    const second = await syncTheraConnections({ mapId, characterId: null, connections });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.summary).toEqual({ systems: 0, connections: 0 });
    expect(second.data.payloads).toHaveLength(0);

    const connsAfter = await db
      .select({ id: apMapConnection.id })
      .from(apMapConnection)
      .where(eq(apMapConnection.mapId, mapId));
    expect(connsAfter).toHaveLength(2);
  });

  it('syncTheraConnections: skips a self-loop row', async () => {
    const result = await syncTheraConnections({
      mapId,
      characterId: null,
      connections: [
        { hubSystemId: THERA, hubName: 'Thera', targetSystemId: THERA, signatureId: null },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary).toEqual({ systems: 0, connections: 0 });
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

async function cleanup() {
  if (mapId) {
    await db.delete(apMapConnection).where(eq(apMapConnection.mapId, mapId));
    await db.delete(apMapSystem).where(eq(apMapSystem.mapId, mapId));
    await db.delete(apMapEvent).where(eq(apMapEvent.mapId, mapId));
  }
  await db.delete(apMap).where(eq(apMap.name, MAP_NAME));
  await db
    .delete(universeSystem)
    .where(inArray(universeSystem.id, [THERA, TURNUR, TARGET_A, TARGET_K]));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
