// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apCorporation,
  apCorporationRight,
  apUser,
} from '@/db/schema';
import { canCreateMap } from '@/lib/auth/rights';

/**
 * Stage 16.5 — admin corp-rights matrix (real Postgres).
 *
 * Drives `adminUpsertCorpRight` / `adminDeleteCorpRight` end-to-end and
 * asserts:
 *   - upsert flips `canCreateMap` for a corp's member;
 *   - delete restores the "no grant" state;
 *   - manager in corp B cannot upsert a row for corp A;
 *   - member is denied every action.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

let currentSession: Session | null = null;
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => currentSession) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { adminUpsertCorpRight, adminDeleteCorpRight } = await import(
  '@/app/(admin)/actions/settings'
);
const { listCorpsForAdmin, loadCorpRightsMatrix } = await import(
  '@/lib/admin/corpRights'
);

const CORP_A = 96005011n;
const CORP_B = 96005012n;

const ADMIN_ID = 96005001n;
const MANAGER_A_ID = 96005002n;
const MANAGER_B_ID = 96005003n;
const MEMBER_A_ID = 96005004n;

let userId = 0;

const characterIds = [ADMIN_ID, MANAGER_A_ID, MANAGER_B_ID, MEMBER_A_ID];

function asSession(characterId: bigint): Session {
  return { characterId: characterId.toString(), user: { id: '0' } } as unknown as Session;
}

async function clearAllCorpRights(): Promise<void> {
  await db
    .delete(apCorporationRight)
    .where(inArray(apCorporationRight.corporationId, [CORP_A, CORP_B]));
}

describe.skipIf(!run)('Stage 16.5 — admin corp-rights matrix (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    await db.insert(apCorporation).values([
      { id: CORP_A, name: 'Settings Test Corp A' },
      { id: CORP_B, name: 'Settings Test Corp B' },
    ]);

    await db.insert(apCharacter).values([
      {
        id: ADMIN_ID,
        userId,
        name: 'Settings Admin',
        ownerHash: `hash-${ADMIN_ID.toString()}`,
        authzLevel: 'admin',
        corporationId: CORP_A,
      },
      {
        id: MANAGER_A_ID,
        userId,
        name: 'Settings Manager A',
        ownerHash: `hash-${MANAGER_A_ID.toString()}`,
        authzLevel: 'manager',
        corporationId: CORP_A,
      },
      {
        id: MANAGER_B_ID,
        userId,
        name: 'Settings Manager B',
        ownerHash: `hash-${MANAGER_B_ID.toString()}`,
        authzLevel: 'manager',
        corporationId: CORP_B,
      },
      {
        id: MEMBER_A_ID,
        userId,
        name: 'Settings Member A',
        ownerHash: `hash-${MEMBER_A_ID.toString()}`,
        corporationId: CORP_A,
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  beforeEach(async () => {
    currentSession = null;
    await clearAllCorpRights();
  });

  // ─── upsert / delete round-trip ──────────────────────────────────────────

  it('upsert toggles canCreateMap for a corp member', async () => {
    currentSession = asSession(ADMIN_ID);

    expect(await canCreateMap(MEMBER_A_ID)).toBe(false);

    const granted = await adminUpsertCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_create',
      minAuthzLevel: 'member',
    });
    expect(granted.ok).toBe(true);
    expect(await canCreateMap(MEMBER_A_ID)).toBe(true);

    const raised = await adminUpsertCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_create',
      minAuthzLevel: 'manager',
    });
    expect(raised.ok).toBe(true);
    expect(await canCreateMap(MEMBER_A_ID)).toBe(false);
  });

  it('delete removes the grant entirely', async () => {
    currentSession = asSession(ADMIN_ID);

    await adminUpsertCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_update',
      minAuthzLevel: 'member',
    });

    const deleted = await adminDeleteCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_update',
    });
    expect(deleted.ok).toBe(true);

    const [row] = await db
      .select({ right: apCorporationRight.right })
      .from(apCorporationRight)
      .where(
        and(
          eq(apCorporationRight.corporationId, CORP_A),
          eq(apCorporationRight.right, 'map_update'),
        ),
      );
    expect(row).toBeUndefined();
  });

  it('delete on an absent row is a no-op success', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminDeleteCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_share',
    });
    expect(result.ok).toBe(true);
  });

  // ─── manager scope ───────────────────────────────────────────────────────

  it('manager in corp B cannot upsert a row for corp A', async () => {
    currentSession = asSession(MANAGER_B_ID);
    const result = await adminUpsertCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_update',
      minAuthzLevel: 'member',
    });
    expect(result.ok).toBe(false);
    const rows = await db
      .select({ right: apCorporationRight.right })
      .from(apCorporationRight)
      .where(eq(apCorporationRight.corporationId, CORP_A));
    expect(rows.length).toBe(0);
  });

  it('manager in corp B cannot delete a row for corp A', async () => {
    currentSession = asSession(ADMIN_ID);
    await adminUpsertCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_update',
      minAuthzLevel: 'member',
    });

    currentSession = asSession(MANAGER_B_ID);
    const result = await adminDeleteCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_update',
    });
    expect(result.ok).toBe(false);

    const rows = await db
      .select({ right: apCorporationRight.right })
      .from(apCorporationRight)
      .where(eq(apCorporationRight.corporationId, CORP_A));
    expect(rows.length).toBe(1);
  });

  it('manager in corp A can upsert a row for corp A', async () => {
    currentSession = asSession(MANAGER_A_ID);
    const result = await adminUpsertCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_share',
      minAuthzLevel: 'manager',
    });
    expect(result.ok).toBe(true);
  });

  // ─── auth gate ───────────────────────────────────────────────────────────

  it('member is denied every settings action', async () => {
    currentSession = asSession(MEMBER_A_ID);
    expect(
      (
        await adminUpsertCorpRight({
          corporationId: CORP_A.toString(),
          right: 'map_create',
          minAuthzLevel: 'member',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await adminDeleteCorpRight({
          corporationId: CORP_A.toString(),
          right: 'map_create',
        })
      ).ok,
    ).toBe(false);
  });

  it('unauthenticated session is denied every settings action', async () => {
    currentSession = null;
    expect(
      (
        await adminUpsertCorpRight({
          corporationId: CORP_A.toString(),
          right: 'map_create',
          minAuthzLevel: 'member',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await adminDeleteCorpRight({
          corporationId: CORP_A.toString(),
          right: 'map_create',
        })
      ).ok,
    ).toBe(false);
  });

  // ─── loaders ─────────────────────────────────────────────────────────────

  it('listCorpsForAdmin returns every corp for global scope', async () => {
    const corps = await listCorpsForAdmin({ kind: 'global' });
    const ids = corps.map((c) => c.id);
    expect(ids).toContain(CORP_A.toString());
    expect(ids).toContain(CORP_B.toString());
  });

  it('listCorpsForAdmin returns only the manager corp for corp scope', async () => {
    const corps = await listCorpsForAdmin({
      kind: 'corp',
      corporationId: CORP_B,
      allianceId: null,
    });
    expect(corps.length).toBe(1);
    expect(corps[0]!.id).toBe(CORP_B.toString());
  });

  it('loadCorpRightsMatrix returns all six rights with null defaults', async () => {
    const matrix = await loadCorpRightsMatrix(CORP_A);
    expect(matrix.rights).toHaveLength(6);
    expect(matrix.rights.every((r) => r.minAuthzLevel === null)).toBe(true);
  });

  it('loadCorpRightsMatrix surfaces existing grants', async () => {
    currentSession = asSession(ADMIN_ID);
    await adminUpsertCorpRight({
      corporationId: CORP_A.toString(),
      right: 'map_create',
      minAuthzLevel: 'manager',
    });
    const matrix = await loadCorpRightsMatrix(CORP_A);
    const createRow = matrix.rights.find((r) => r.right === 'map_create')!;
    expect(createRow.minAuthzLevel).toBe('manager');
    const updateRow = matrix.rights.find((r) => r.right === 'map_update')!;
    expect(updateRow.minAuthzLevel).toBeNull();
  });
});

async function cleanup() {
  await db
    .delete(apCorporationRight)
    .where(inArray(apCorporationRight.corporationId, [CORP_A, CORP_B]));
  await db.delete(apCharacter).where(inArray(apCharacter.id, characterIds));
  await db.delete(apCorporation).where(inArray(apCorporation.id, [CORP_A, CORP_B]));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
}
