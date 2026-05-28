// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db, pool } from '@/db/client';
import { apCharacter, apCorporation, apMap, apUser } from '@/db/schema';

/**
 * Stage 16.2 — admin map actions (real Postgres).
 *
 * Drives `adminSoftDeleteMap` / `adminRestoreMap` / `adminPurgeMap` end to end
 * against a live Postgres + asserts:
 *   - soft-delete sets `deleted_at` and lands one `map.delete` event;
 *   - restore clears `deleted_at` and lands one `map.restore` event;
 *   - purge hard-deletes the row AND cascades through `ap_map_event`;
 *   - manager cannot purge (admin-only);
 *   - manager in corp B is denied for actions on a corp-A map.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

// `@/lib/auth` pulls in next-auth which only resolves inside the Next bundler;
// stub it so the admin actions can call `auth()` against a mutable per-test
// session. `next/cache` is similarly bundler-only — `revalidatePath` is a no-op
// in tests.
let currentSession: Session | null = null;
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => currentSession) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { adminSoftDeleteMap, adminRestoreMap, adminPurgeMap } = await import(
  '@/app/(admin)/actions/maps'
);

const CORP_A = 96000001n;
const CORP_B = 96000002n;
const ALLIANCE_A = 96000901n;

const ADMIN_ID = 96001001n;
const MANAGER_A_ID = 96001002n; // manager in corp A
const MANAGER_B_ID = 96001003n; // manager in corp B
const MEMBER_A_ID = 96001004n;

let userId = 0;
let activeMapId = 0n;
let softDeletedMapId = 0n;
let crossCorpMapId = 0n;

const characterIds = [ADMIN_ID, MANAGER_A_ID, MANAGER_B_ID, MEMBER_A_ID];

function asSession(characterId: bigint): Session {
  // `Session` is from next-auth; the actions only read `.characterId`. Cast
  // through `unknown` to satisfy the augmented type without dragging the whole
  // module declaration into the test.
  return { characterId: characterId.toString(), user: { id: '0' } } as unknown as Session;
}

async function eventCount(mapId: bigint, kind: string): Promise<number> {
  const rows = (
    await db.execute(
      sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${mapId} AND kind = ${kind}`,
    )
  ).rows as Array<{ count: number }>;
  return rows[0]!.count;
}

async function softDelete(mapId: bigint): Promise<void> {
  await db.update(apMap).set({ deletedAt: new Date() }).where(eq(apMap.id, mapId));
}

describe.skipIf(!run)('Stage 16.2 — admin map actions (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    await db.insert(apCorporation).values([
      { id: CORP_A, name: 'Admin Test Corp A', allianceId: ALLIANCE_A },
      { id: CORP_B, name: 'Admin Test Corp B' },
    ]);

    await db.insert(apCharacter).values([
      {
        id: ADMIN_ID,
        userId,
        name: 'Admin Director',
        ownerHash: `hash-${ADMIN_ID.toString()}`,
        authzLevel: 'admin',
        corporationId: CORP_A,
        allianceId: ALLIANCE_A,
      },
      {
        id: MANAGER_A_ID,
        userId,
        name: 'Manager Corp A',
        ownerHash: `hash-${MANAGER_A_ID.toString()}`,
        authzLevel: 'manager',
        corporationId: CORP_A,
        allianceId: ALLIANCE_A,
      },
      {
        id: MANAGER_B_ID,
        userId,
        name: 'Manager Corp B',
        ownerHash: `hash-${MANAGER_B_ID.toString()}`,
        authzLevel: 'manager',
        corporationId: CORP_B,
      },
      {
        id: MEMBER_A_ID,
        userId,
        name: 'Member Corp A',
        ownerHash: `hash-${MEMBER_A_ID.toString()}`,
        corporationId: CORP_A,
        allianceId: ALLIANCE_A,
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  beforeEach(async () => {
    currentSession = null;
    // Drop any leftover test maps from prior iterations.
    await db
      .delete(apMap)
      .where(
        sql`name IN ('Admin Test Active', 'Admin Test SoftDeleted', 'Admin Test CrossCorp')`,
      );

    const inserted = await db
      .insert(apMap)
      .values([
        {
          name: 'Admin Test Active',
          scope: 'wh',
          type: 'corp',
          ownerCorporationId: CORP_A,
        },
        {
          name: 'Admin Test SoftDeleted',
          scope: 'wh',
          type: 'corp',
          ownerCorporationId: CORP_A,
        },
        {
          name: 'Admin Test CrossCorp',
          scope: 'wh',
          type: 'corp',
          ownerCorporationId: CORP_B,
        },
      ])
      .returning({ id: apMap.id, name: apMap.name });

    activeMapId = inserted.find((m) => m.name === 'Admin Test Active')!.id;
    softDeletedMapId = inserted.find((m) => m.name === 'Admin Test SoftDeleted')!.id;
    crossCorpMapId = inserted.find((m) => m.name === 'Admin Test CrossCorp')!.id;
    await softDelete(softDeletedMapId);
  });

  // ─── adminSoftDeleteMap ──────────────────────────────────────────────────

  it('adminSoftDeleteMap as admin flips deleted_at and lands one map.delete event', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminSoftDeleteMap(activeMapId.toString());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ kind: 'map.delete', id: activeMapId.toString() });

    const [row] = await db
      .select({ deletedAt: apMap.deletedAt })
      .from(apMap)
      .where(eq(apMap.id, activeMapId));
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(await eventCount(activeMapId, 'map.delete')).toBe(1);
  });

  it('adminSoftDeleteMap refuses an already-soft-deleted map', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminSoftDeleteMap(softDeletedMapId.toString());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already/i);
  });

  // ─── adminRestoreMap ─────────────────────────────────────────────────────

  it('adminRestoreMap clears deleted_at and lands one map.restore event', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminRestoreMap(softDeletedMapId.toString());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ kind: 'map.restore', id: softDeletedMapId.toString() });

    const [row] = await db
      .select({ deletedAt: apMap.deletedAt })
      .from(apMap)
      .where(eq(apMap.id, softDeletedMapId));
    expect(row?.deletedAt).toBeNull();
    expect(await eventCount(softDeletedMapId, 'map.restore')).toBe(1);
  });

  it('adminRestoreMap refuses a non-soft-deleted map', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminRestoreMap(activeMapId.toString());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not soft-deleted/i);
  });

  // ─── adminPurgeMap ───────────────────────────────────────────────────────

  it('adminPurgeMap hard-deletes the row and cascades its events', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminPurgeMap(softDeletedMapId.toString());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ kind: 'map.purge', id: softDeletedMapId.toString() });

    const mapRows = await db
      .select({ id: apMap.id })
      .from(apMap)
      .where(eq(apMap.id, softDeletedMapId));
    expect(mapRows).toHaveLength(0);

    const eventRows = (
      await db.execute(
        sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${softDeletedMapId}`,
      )
    ).rows as Array<{ count: number }>;
    expect(eventRows[0]!.count).toBe(0);
  });

  it('adminPurgeMap refuses an active (non-soft-deleted) map', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminPurgeMap(activeMapId.toString());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/soft-deleted/i);
  });

  it('adminPurgeMap as manager is denied (admin-only)', async () => {
    currentSession = asSession(MANAGER_A_ID);
    const result = await adminPurgeMap(softDeletedMapId.toString());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/admin/i);

    // The map row must still exist after the denied call.
    const [row] = await db
      .select({ id: apMap.id })
      .from(apMap)
      .where(eq(apMap.id, softDeletedMapId));
    expect(row).toBeDefined();
  });

  // ─── manager scope ───────────────────────────────────────────────────────

  it('manager in corp B cannot soft-delete a corp-A map', async () => {
    currentSession = asSession(MANAGER_B_ID);
    const result = await adminSoftDeleteMap(activeMapId.toString());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not found/i);
  });

  it('manager in corp B cannot restore a corp-A map', async () => {
    currentSession = asSession(MANAGER_B_ID);
    const result = await adminRestoreMap(softDeletedMapId.toString());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not found/i);
  });

  it('manager in corp A can soft-delete a corp-A map', async () => {
    currentSession = asSession(MANAGER_A_ID);
    const result = await adminSoftDeleteMap(activeMapId.toString());
    expect(result.ok).toBe(true);
  });

  it('manager in corp B can soft-delete their own corp-B map', async () => {
    currentSession = asSession(MANAGER_B_ID);
    const result = await adminSoftDeleteMap(crossCorpMapId.toString());
    expect(result.ok).toBe(true);
  });

  // ─── auth gate ───────────────────────────────────────────────────────────

  it('member is denied every admin action', async () => {
    currentSession = asSession(MEMBER_A_ID);
    expect((await adminSoftDeleteMap(activeMapId.toString())).ok).toBe(false);
    expect((await adminRestoreMap(softDeletedMapId.toString())).ok).toBe(false);
    expect((await adminPurgeMap(softDeletedMapId.toString())).ok).toBe(false);
  });

  it('unauthenticated session is denied every admin action', async () => {
    currentSession = null;
    expect((await adminSoftDeleteMap(activeMapId.toString())).ok).toBe(false);
    expect((await adminRestoreMap(softDeletedMapId.toString())).ok).toBe(false);
    expect((await adminPurgeMap(softDeletedMapId.toString())).ok).toBe(false);
  });
});

async function cleanup() {
  await db
    .delete(apMap)
    .where(
      sql`name IN ('Admin Test Active', 'Admin Test SoftDeleted', 'Admin Test CrossCorp')`,
    );
  await db.delete(apCharacter).where(inArray(apCharacter.id, characterIds));
  await db.delete(apCorporation).where(inArray(apCorporation.id, [CORP_A, CORP_B]));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
}
