// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db, pool } from '@/db/client';
import { apCharacter, apCorporation, apUser } from '@/db/schema';

/**
 * Stage 16.3 — admin member actions (real Postgres).
 *
 * Drives `adminKickCharacter` / `adminBanCharacter` / `adminActivateCharacter`
 * / `adminGrantManager` / `adminRevokeManager` end to end against a live
 * Postgres + asserts:
 *   - kick sets `status='kicked'` with `status_expires_at` set;
 *   - ban sets `status='banned'` with NULL expiry;
 *   - activate clears both kick and ban;
 *   - grant/revoke flip `authz_level` and survive `syncCharacterAuthz`-style
 *     resync (simulated by the CASE clause the sync helper uses);
 *   - manager cannot grant/revoke (admin-only);
 *   - manager in corp B is denied for actions on a corp-A character.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

let currentSession: Session | null = null;
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => currentSession) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const {
  adminKickCharacter,
  adminBanCharacter,
  adminActivateCharacter,
  adminGrantManager,
  adminRevokeManager,
} = await import('@/app/(admin)/actions/members');

const CORP_A = 96000011n;
const CORP_B = 96000012n;
const ALLIANCE_A = 96000911n;

const ADMIN_ID = 96002001n;
const MANAGER_A_ID = 96002002n;
const MANAGER_B_ID = 96002003n;
const MEMBER_A_ID = 96002004n;
const TARGET_A_ID = 96002005n; // ordinary member in corp A — every action's target
const TARGET_B_ID = 96002006n; // ordinary member in corp B
const ADMIN_TARGET_ID = 96002007n; // admin-level row — grant/revoke must refuse

let userId = 0;

const characterIds = [
  ADMIN_ID,
  MANAGER_A_ID,
  MANAGER_B_ID,
  MEMBER_A_ID,
  TARGET_A_ID,
  TARGET_B_ID,
  ADMIN_TARGET_ID,
];

function asSession(characterId: bigint): Session {
  return { characterId: characterId.toString(), user: { id: '0' } } as unknown as Session;
}

async function loadStatus(id: bigint) {
  const [row] = await db
    .select({
      status: apCharacter.status,
      statusExpiresAt: apCharacter.statusExpiresAt,
      statusReason: apCharacter.statusReason,
      authzLevel: apCharacter.authzLevel,
    })
    .from(apCharacter)
    .where(eq(apCharacter.id, id));
  return row!;
}

async function resetTargetA(): Promise<void> {
  await db
    .update(apCharacter)
    .set({
      status: 'active',
      statusExpiresAt: null,
      statusReason: null,
      statusChangedAt: null,
      authzLevel: 'member',
    })
    .where(eq(apCharacter.id, TARGET_A_ID));
}

async function resetTargetB(): Promise<void> {
  await db
    .update(apCharacter)
    .set({
      status: 'active',
      statusExpiresAt: null,
      statusReason: null,
      statusChangedAt: null,
      authzLevel: 'member',
    })
    .where(eq(apCharacter.id, TARGET_B_ID));
}

describe.skipIf(!run)('Stage 16.3 — admin member actions (real Postgres)', () => {
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
      {
        id: TARGET_A_ID,
        userId,
        name: 'Target Corp A',
        ownerHash: `hash-${TARGET_A_ID.toString()}`,
        corporationId: CORP_A,
        allianceId: ALLIANCE_A,
      },
      {
        id: TARGET_B_ID,
        userId,
        name: 'Target Corp B',
        ownerHash: `hash-${TARGET_B_ID.toString()}`,
        corporationId: CORP_B,
      },
      {
        id: ADMIN_TARGET_ID,
        userId,
        name: 'Admin Target',
        ownerHash: `hash-${ADMIN_TARGET_ID.toString()}`,
        authzLevel: 'admin',
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
    await resetTargetA();
    await resetTargetB();
  });

  // ─── kick ────────────────────────────────────────────────────────────────

  it('adminKickCharacter as admin sets kicked + 60-min expiry', async () => {
    currentSession = asSession(ADMIN_ID);
    const before = Date.now();
    const result = await adminKickCharacter(TARGET_A_ID.toString(), 60, 'spamming');
    expect(result.ok).toBe(true);

    const row = await loadStatus(TARGET_A_ID);
    expect(row.status).toBe('kicked');
    expect(row.statusReason).toBe('spamming');
    expect(row.statusExpiresAt).toBeInstanceOf(Date);
    const minutesAhead = (row.statusExpiresAt!.getTime() - before) / 60000;
    // Allow a generous window — actions run sequentially against the DB, so
    // the round-trip can take a second or two on slow CI.
    expect(minutesAhead).toBeGreaterThan(59);
    expect(minutesAhead).toBeLessThan(61);
  });

  it('adminKickCharacter refuses unknown duration', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminKickCharacter(TARGET_A_ID.toString(), 30 as never);
    expect(result.ok).toBe(false);
  });

  // ─── ban ─────────────────────────────────────────────────────────────────

  it('adminBanCharacter clears expiry and stores reason', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminBanCharacter(TARGET_A_ID.toString(), 'multibox cheating');
    expect(result.ok).toBe(true);

    const row = await loadStatus(TARGET_A_ID);
    expect(row.status).toBe('banned');
    expect(row.statusExpiresAt).toBeNull();
    expect(row.statusReason).toBe('multibox cheating');
  });

  it('adminBanCharacter requires a non-empty reason', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminBanCharacter(TARGET_A_ID.toString(), '');
    expect(result.ok).toBe(false);
  });

  // ─── activate ────────────────────────────────────────────────────────────

  it('adminActivateCharacter clears a kicked row', async () => {
    currentSession = asSession(ADMIN_ID);
    await adminKickCharacter(TARGET_A_ID.toString(), 1440);
    const result = await adminActivateCharacter(TARGET_A_ID.toString());
    expect(result.ok).toBe(true);

    const row = await loadStatus(TARGET_A_ID);
    expect(row.status).toBe('active');
    expect(row.statusExpiresAt).toBeNull();
    expect(row.statusReason).toBeNull();
  });

  it('adminActivateCharacter clears a banned row', async () => {
    currentSession = asSession(ADMIN_ID);
    await adminBanCharacter(TARGET_A_ID.toString(), 'test');
    const result = await adminActivateCharacter(TARGET_A_ID.toString());
    expect(result.ok).toBe(true);
    expect((await loadStatus(TARGET_A_ID)).status).toBe('active');
  });

  // ─── grant / revoke manager ──────────────────────────────────────────────

  it('adminGrantManager as admin promotes a member to manager', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminGrantManager(TARGET_A_ID.toString());
    expect(result.ok).toBe(true);
    expect((await loadStatus(TARGET_A_ID)).authzLevel).toBe('manager');
  });

  it('grant survives a syncCharacterAuthz-shaped CASE resync', async () => {
    currentSession = asSession(ADMIN_ID);
    await adminGrantManager(TARGET_A_ID.toString());

    // Mirror the `syncCharacterAuthz` CASE clause: if the existing value is
    // `'manager'`, keep it; otherwise set to whatever ESI dictates (here:
    // `'member'`, simulating a non-Director resync).
    await db
      .update(apCharacter)
      .set({
        authzLevel: sql`CASE WHEN ${apCharacter.authzLevel} = 'manager' THEN 'manager'::authz_level ELSE 'member'::authz_level END`,
      })
      .where(eq(apCharacter.id, TARGET_A_ID));

    expect((await loadStatus(TARGET_A_ID)).authzLevel).toBe('manager');
  });

  it('adminRevokeManager flips manager back to member', async () => {
    currentSession = asSession(ADMIN_ID);
    await adminGrantManager(TARGET_A_ID.toString());
    const result = await adminRevokeManager(TARGET_A_ID.toString());
    expect(result.ok).toBe(true);
    expect((await loadStatus(TARGET_A_ID)).authzLevel).toBe('member');
  });

  it('adminGrantManager refuses on an admin row', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminGrantManager(ADMIN_TARGET_ID.toString());
    expect(result.ok).toBe(false);
    expect((await loadStatus(ADMIN_TARGET_ID)).authzLevel).toBe('admin');
  });

  it('adminRevokeManager refuses on an admin row', async () => {
    currentSession = asSession(ADMIN_ID);
    const result = await adminRevokeManager(ADMIN_TARGET_ID.toString());
    expect(result.ok).toBe(false);
    expect((await loadStatus(ADMIN_TARGET_ID)).authzLevel).toBe('admin');
  });

  it('adminGrantManager as manager is denied (admin-only)', async () => {
    currentSession = asSession(MANAGER_A_ID);
    const result = await adminGrantManager(TARGET_A_ID.toString());
    expect(result.ok).toBe(false);
    expect((await loadStatus(TARGET_A_ID)).authzLevel).toBe('member');
  });

  it('adminRevokeManager as manager is denied (admin-only)', async () => {
    currentSession = asSession(ADMIN_ID);
    await adminGrantManager(TARGET_A_ID.toString());
    currentSession = asSession(MANAGER_A_ID);
    const result = await adminRevokeManager(TARGET_A_ID.toString());
    expect(result.ok).toBe(false);
    expect((await loadStatus(TARGET_A_ID)).authzLevel).toBe('manager');
  });

  // ─── manager scope ───────────────────────────────────────────────────────

  it('manager in corp B cannot kick a corp-A target', async () => {
    currentSession = asSession(MANAGER_B_ID);
    const result = await adminKickCharacter(TARGET_A_ID.toString(), 5);
    expect(result.ok).toBe(false);
    expect((await loadStatus(TARGET_A_ID)).status).toBe('active');
  });

  it('manager in corp B cannot ban a corp-A target', async () => {
    currentSession = asSession(MANAGER_B_ID);
    const result = await adminBanCharacter(TARGET_A_ID.toString(), 'test');
    expect(result.ok).toBe(false);
    expect((await loadStatus(TARGET_A_ID)).status).toBe('active');
  });

  it('manager in corp A can kick a corp-A target', async () => {
    currentSession = asSession(MANAGER_A_ID);
    const result = await adminKickCharacter(TARGET_A_ID.toString(), 5);
    expect(result.ok).toBe(true);
    expect((await loadStatus(TARGET_A_ID)).status).toBe('kicked');
  });

  it('manager in corp B can kick their own corp-B target', async () => {
    currentSession = asSession(MANAGER_B_ID);
    const result = await adminKickCharacter(TARGET_B_ID.toString(), 5);
    expect(result.ok).toBe(true);
    expect((await loadStatus(TARGET_B_ID)).status).toBe('kicked');
  });

  // ─── auth gate ───────────────────────────────────────────────────────────

  it('member is denied every member action', async () => {
    currentSession = asSession(MEMBER_A_ID);
    expect((await adminKickCharacter(TARGET_A_ID.toString(), 5)).ok).toBe(false);
    expect((await adminBanCharacter(TARGET_A_ID.toString(), 'x')).ok).toBe(false);
    expect((await adminActivateCharacter(TARGET_A_ID.toString())).ok).toBe(false);
    expect((await adminGrantManager(TARGET_A_ID.toString())).ok).toBe(false);
    expect((await adminRevokeManager(TARGET_A_ID.toString())).ok).toBe(false);
  });

  it('unauthenticated session is denied every member action', async () => {
    currentSession = null;
    expect((await adminKickCharacter(TARGET_A_ID.toString(), 5)).ok).toBe(false);
    expect((await adminBanCharacter(TARGET_A_ID.toString(), 'x')).ok).toBe(false);
    expect((await adminActivateCharacter(TARGET_A_ID.toString())).ok).toBe(false);
    expect((await adminGrantManager(TARGET_A_ID.toString())).ok).toBe(false);
    expect((await adminRevokeManager(TARGET_A_ID.toString())).ok).toBe(false);
  });
});

async function cleanup() {
  await db.delete(apCharacter).where(inArray(apCharacter.id, characterIds));
  await db.delete(apCorporation).where(inArray(apCorporation.id, [CORP_A, CORP_B]));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
}
