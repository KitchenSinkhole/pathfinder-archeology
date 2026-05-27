// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apCharacterRole,
  apCorporation,
  apCorporationRight,
  apMap,
  apMapRoleAccess,
  apRole,
  apUser,
} from '@/db/schema';
import {
  canCreateMap,
  canMutateMap,
  canViewMap,
  isAdmin,
} from '@/lib/auth/rights';
import { listViewableMaps } from '@/lib/map/loadMap';
import { characterCleanup } from '@/lib/jobs/tasks/characterCleanup';

/**
 * Stage 15.7 acceptance gate (`docs/plans/rebuild-roadmap.md` §15 "Done when").
 *
 * Drives the rights matrix end-to-end against real Postgres:
 *   - Owner-by-scope (private/corp/alliance) view + mutate truth table.
 *   - Corp-right grants for non-owner members.
 *   - `map_delete` / `map_share` owner-or-admin restriction.
 *   - Role overlay grants view only (no mutation by themselves).
 *   - Director-promoted admin sees and mutates every map.
 *   - Kicked / banned characters fail every check.
 *   - `listViewableMaps` SQL filter matches the per-check results.
 *   - `character-cleanup` cron clears expired kicks.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

const CORP_A = 99000001n;
const CORP_B = 99000002n;
const ALLIANCE_X = 99000901n;
const ALLIANCE_Y = 99000902n;

const ADMIN_ID = 99001001n;
const OWNER_ID = 99001002n;
const CORP_A_MEMBER_ID = 99001003n;
const CORP_A_GRANTED_ID = 99001004n;
const CORP_B_MEMBER_ID = 99001005n;
const ALLIANCE_X_PILOT_ID = 99001006n;
const KICKED_ID = 99001007n;
const ROLE_HOLDER_ID = 99001008n;

const CORP_TITLE_ROLE_ID = 99002001n;

let userId = 0;
let privateMapId = 0n;
let corpMapId = 0n;
let allianceMapId = 0n;
let roleScopedMapId = 0n;

const characterIds = [
  ADMIN_ID,
  OWNER_ID,
  CORP_A_MEMBER_ID,
  CORP_A_GRANTED_ID,
  CORP_B_MEMBER_ID,
  ALLIANCE_X_PILOT_ID,
  KICKED_ID,
  ROLE_HOLDER_ID,
];

describe.skipIf(!run)('Stage 15 — permissions (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;

    // Two corps, two alliances. Corp A is in Alliance X.
    await db.insert(apCorporation).values([
      { id: CORP_A, name: 'Test Corp A', allianceId: ALLIANCE_X },
      { id: CORP_B, name: 'Test Corp B', allianceId: ALLIANCE_Y },
    ]);

    // Characters covering every permission lane.
    await db.insert(apCharacter).values([
      mkChar(ADMIN_ID, 'Director Admin', { authzLevel: 'admin', corporationId: CORP_A, allianceId: ALLIANCE_X }),
      mkChar(OWNER_ID, 'Map Owner', { corporationId: CORP_A, allianceId: ALLIANCE_X }),
      mkChar(CORP_A_MEMBER_ID, 'Corp A Member', { corporationId: CORP_A, allianceId: ALLIANCE_X }),
      mkChar(CORP_A_GRANTED_ID, 'Corp A With Right', { corporationId: CORP_A, allianceId: ALLIANCE_X }),
      mkChar(CORP_B_MEMBER_ID, 'Corp B Outsider', { corporationId: CORP_B, allianceId: ALLIANCE_Y }),
      mkChar(ALLIANCE_X_PILOT_ID, 'Alliance X Pilot', { corporationId: CORP_B, allianceId: ALLIANCE_X }),
      mkChar(KICKED_ID, 'Kicked Pilot', {
        corporationId: CORP_A,
        allianceId: ALLIANCE_X,
        status: 'kicked',
        statusExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
      mkChar(ROLE_HOLDER_ID, 'Role Holder', { corporationId: CORP_B, allianceId: ALLIANCE_Y }),
    ]);

    // Corp A grants `map_update` to members (`min_authz_level='member'`).
    // Note: the test's `CORP_A_GRANTED_ID` is the same authz level as
    // `CORP_A_MEMBER_ID`. We give the right to the corp; the matrix says
    // "members can do this", so both pass. To prove the gate works we'll
    // also test `CORP_B_MEMBER_ID` (no grant on Corp B) gets denied.
    await db.insert(apCorporationRight).values({
      corporationId: CORP_A,
      right: 'map_update',
      minAuthzLevel: 'member',
    });
    // map_create granted to Corp A members only.
    await db.insert(apCorporationRight).values({
      corporationId: CORP_A,
      right: 'map_create',
      minAuthzLevel: 'member',
    });

    // A role used to grant cross-corp view access to one specific map.
    await db.insert(apRole).values({
      id: CORP_TITLE_ROLE_ID,
      source: 'corp_title',
      externalRef: `${CORP_B.toString()}:42`,
      name: 'Logistics',
      corporationId: CORP_B,
    });
    await db.insert(apCharacterRole).values({
      characterId: ROLE_HOLDER_ID,
      roleId: CORP_TITLE_ROLE_ID,
      grantedBy: 'corp-title-sync',
    });

    // The four maps under test.
    const inserted = await db
      .insert(apMap)
      .values([
        {
          name: 'Owner Private',
          scope: 'wh',
          type: 'private',
          ownerCharacterId: OWNER_ID,
        },
        {
          name: 'Corp A Map',
          scope: 'all',
          type: 'corp',
          ownerCorporationId: CORP_A,
        },
        {
          name: 'Alliance X Map',
          scope: 'all',
          type: 'alliance',
          ownerAllianceId: ALLIANCE_X,
        },
        {
          name: 'Role-Scoped Map',
          scope: 'all',
          type: 'private',
          ownerCharacterId: OWNER_ID,
        },
      ])
      .returning({ id: apMap.id, name: apMap.name });

    privateMapId = inserted.find((m) => m.name === 'Owner Private')!.id;
    corpMapId = inserted.find((m) => m.name === 'Corp A Map')!.id;
    allianceMapId = inserted.find((m) => m.name === 'Alliance X Map')!.id;
    roleScopedMapId = inserted.find((m) => m.name === 'Role-Scoped Map')!.id;

    // The role-scoped map grants access to the `corp_title` Logistics role.
    await db.insert(apMapRoleAccess).values({
      mapId: roleScopedMapId,
      roleId: CORP_TITLE_ROLE_ID,
    });
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  // ─── view rules ──────────────────────────────────────────────────────────

  it('owner can view their private map; nobody else can', async () => {
    expect(await canViewMap(OWNER_ID, privateMapId)).toBe(true);
    expect(await canViewMap(CORP_A_MEMBER_ID, privateMapId)).toBe(false);
    expect(await canViewMap(CORP_B_MEMBER_ID, privateMapId)).toBe(false);
    expect(await canViewMap(ADMIN_ID, privateMapId)).toBe(true);
  });

  it('corp members view the corp map; outsiders cannot', async () => {
    expect(await canViewMap(OWNER_ID, corpMapId)).toBe(true); // in corp A
    expect(await canViewMap(CORP_A_MEMBER_ID, corpMapId)).toBe(true);
    expect(await canViewMap(CORP_B_MEMBER_ID, corpMapId)).toBe(false);
    expect(await canViewMap(ALLIANCE_X_PILOT_ID, corpMapId)).toBe(false);
  });

  it('alliance members view the alliance map regardless of corp', async () => {
    // Corp A is in Alliance X → its members see the alliance map.
    expect(await canViewMap(OWNER_ID, allianceMapId)).toBe(true);
    // Corp B is in Alliance Y → its members do NOT see Alliance X's map.
    expect(await canViewMap(CORP_B_MEMBER_ID, allianceMapId)).toBe(false);
    // Alliance X Pilot is in Corp B but Alliance X (configured deliberately) → sees it.
    expect(await canViewMap(ALLIANCE_X_PILOT_ID, allianceMapId)).toBe(true);
  });

  it('role overlay grants view to a holder outside the owner scope', async () => {
    // Role holder is in Corp B / Alliance Y — would be denied by the owner rule.
    // The `ap_map_role_access` row routes view access via their `corp_title` role.
    expect(await canViewMap(ROLE_HOLDER_ID, roleScopedMapId)).toBe(true);
    // Owner still sees their own map.
    expect(await canViewMap(OWNER_ID, roleScopedMapId)).toBe(true);
    // Random corp member without the role does not.
    expect(await canViewMap(CORP_A_MEMBER_ID, roleScopedMapId)).toBe(false);
  });

  it('kicked characters fail every view check', async () => {
    expect(await canViewMap(KICKED_ID, privateMapId)).toBe(false);
    expect(await canViewMap(KICKED_ID, corpMapId)).toBe(false);
    expect(await canViewMap(KICKED_ID, allianceMapId)).toBe(false);
  });

  // ─── mutate rules ────────────────────────────────────────────────────────

  it('owner can mutate; corp grant lets a non-owner member mutate', async () => {
    expect(await canMutateMap(OWNER_ID, corpMapId, 'map_update')).toBe(true);
    expect(await canMutateMap(CORP_A_MEMBER_ID, corpMapId, 'map_update')).toBe(true);
    expect(await canMutateMap(CORP_A_GRANTED_ID, corpMapId, 'map_update')).toBe(true);
    expect(await canMutateMap(CORP_B_MEMBER_ID, corpMapId, 'map_update')).toBe(false);
  });

  it('map_delete is owner-or-admin only (corp grant insufficient — closes §11 Q8)', async () => {
    // Corp A grants `map_update` to members but not `map_delete`. Even if it
    // did, `map_delete` is excluded from corp-right grants by design.
    expect(await canMutateMap(CORP_A_MEMBER_ID, corpMapId, 'map_delete')).toBe(false);
    // The corp map has no character-owner; only admin can delete.
    expect(await canMutateMap(ADMIN_ID, corpMapId, 'map_delete')).toBe(true);
    // For the private map: OWNER_ID owns it; non-owner corp-mate cannot delete.
    expect(await canMutateMap(OWNER_ID, privateMapId, 'map_delete')).toBe(true);
    expect(await canMutateMap(CORP_A_MEMBER_ID, privateMapId, 'map_delete')).toBe(false);
  });

  it('role overlay alone does not grant mutation', async () => {
    // Role holder gets view but not update — they're not an owner and they
    // don't have a corp-right grant in their own corp (Corp B has no rights row).
    expect(await canViewMap(ROLE_HOLDER_ID, roleScopedMapId)).toBe(true);
    expect(await canMutateMap(ROLE_HOLDER_ID, roleScopedMapId, 'map_update')).toBe(false);
  });

  it('admin (Director) can mutate every map for every right', async () => {
    for (const id of [privateMapId, corpMapId, allianceMapId, roleScopedMapId]) {
      expect(await canMutateMap(ADMIN_ID, id, 'map_update')).toBe(true);
      expect(await canMutateMap(ADMIN_ID, id, 'map_delete')).toBe(true);
      expect(await canMutateMap(ADMIN_ID, id, 'map_share')).toBe(true);
      expect(await canMutateMap(ADMIN_ID, id, 'map_import')).toBe(true);
      expect(await canMutateMap(ADMIN_ID, id, 'map_export')).toBe(true);
    }
  });

  it('canCreateMap consults the actor corp; admin bypasses the matrix', async () => {
    expect(await canCreateMap(CORP_A_MEMBER_ID)).toBe(true);
    expect(await canCreateMap(CORP_B_MEMBER_ID)).toBe(false);
    expect(await canCreateMap(ADMIN_ID)).toBe(true);
    expect(await canCreateMap(KICKED_ID)).toBe(false);
  });

  it('isAdmin gates the admin probe', async () => {
    expect(await isAdmin({ characterId: ADMIN_ID.toString(), userId: 0 } as never)).toBe(true);
    expect(await isAdmin({ characterId: CORP_A_MEMBER_ID.toString(), userId: 0 } as never)).toBe(false);
    expect(await isAdmin(null)).toBe(false);
  });

  // ─── listViewableMaps ────────────────────────────────────────────────────

  it('listViewableMaps matches per-check results', async () => {
    const adminList = await listViewableMaps(ADMIN_ID);
    expect(adminList.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        privateMapId.toString(),
        corpMapId.toString(),
        allianceMapId.toString(),
        roleScopedMapId.toString(),
      ]),
    );

    const memberList = await listViewableMaps(CORP_A_MEMBER_ID);
    const memberIds = memberList.map((m) => m.id);
    expect(memberIds).toContain(corpMapId.toString());
    expect(memberIds).toContain(allianceMapId.toString());
    expect(memberIds).not.toContain(privateMapId.toString());
    expect(memberIds).not.toContain(roleScopedMapId.toString());

    const roleHolderList = await listViewableMaps(ROLE_HOLDER_ID);
    expect(roleHolderList.map((m) => m.id)).toContain(roleScopedMapId.toString());
  });

  // ─── character-cleanup ───────────────────────────────────────────────────

  it('character-cleanup expires past kicks and leaves bans alone', async () => {
    // Set up: one expired kick, one not-yet-expired kick, one ban.
    const ID_EXPIRED = 99003001n;
    const ID_FUTURE = 99003002n;
    const ID_BANNED = 99003003n;
    await db.insert(apCharacter).values([
      mkChar(ID_EXPIRED, 'Expired Kick', {
        status: 'kicked',
        statusExpiresAt: new Date(Date.now() - 60_000),
      }),
      mkChar(ID_FUTURE, 'Future Kick', {
        status: 'kicked',
        statusExpiresAt: new Date(Date.now() + 60 * 60_000),
      }),
      mkChar(ID_BANNED, 'Banned', { status: 'banned' }),
    ]);

    // Run the cron handler directly. The instrumentation wrapper requires a
    // helpers object; we don't actually use it (no addJob inside).
    await characterCleanup.run({}, { addJob: vi.fn() } as never);

    const rows = await db
      .select({ id: apCharacter.id, status: apCharacter.status, expires: apCharacter.statusExpiresAt })
      .from(apCharacter)
      .where(inArray(apCharacter.id, [ID_EXPIRED, ID_FUTURE, ID_BANNED]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(ID_EXPIRED)).toEqual(
      expect.objectContaining({ status: 'active', expires: null }),
    );
    expect(byId.get(ID_FUTURE)).toEqual(
      expect.objectContaining({ status: 'kicked' }),
    );
    expect(byId.get(ID_FUTURE)?.expires).not.toBeNull();
    expect(byId.get(ID_BANNED)).toEqual(
      expect.objectContaining({ status: 'banned' }),
    );

    await db.delete(apCharacter).where(inArray(apCharacter.id, [ID_EXPIRED, ID_FUTURE, ID_BANNED]));
  });
});

// ─── helpers ───────────────────────────────────────────────────────────────

interface CharOverrides {
  authzLevel?: 'member' | 'manager' | 'admin';
  corporationId?: bigint;
  allianceId?: bigint;
  status?: 'active' | 'kicked' | 'banned';
  statusExpiresAt?: Date;
}

function mkChar(id: bigint, name: string, overrides: CharOverrides = {}) {
  return {
    id,
    userId,
    name,
    ownerHash: `hash-${id.toString()}`,
    authzLevel: overrides.authzLevel ?? 'member',
    corporationId: overrides.corporationId ?? null,
    allianceId: overrides.allianceId ?? null,
    status: overrides.status ?? 'active',
    statusExpiresAt: overrides.statusExpiresAt ?? null,
  } as const;
}

async function cleanup() {
  await db
    .delete(apMapRoleAccess)
    .where(inArray(apMapRoleAccess.roleId, [CORP_TITLE_ROLE_ID]));
  // Soft-delete-only check needs to drop both deleted and live rows.
  await db
    .delete(apMap)
    .where(
      sql`name IN ('Owner Private', 'Corp A Map', 'Alliance X Map', 'Role-Scoped Map')`,
    );
  await db
    .delete(apCharacterRole)
    .where(inArray(apCharacterRole.characterId, characterIds));
  await db.delete(apRole).where(eq(apRole.id, CORP_TITLE_ROLE_ID));
  await db
    .delete(apCorporationRight)
    .where(inArray(apCorporationRight.corporationId, [CORP_A, CORP_B]));
  await db.delete(apCharacter).where(inArray(apCharacter.id, characterIds));
  await db.delete(apCorporation).where(inArray(apCorporation.id, [CORP_A, CORP_B]));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
  // Reset the captured map ids so reruns don't reference stale values.
  privateMapId = 0n;
  corpMapId = 0n;
  allianceMapId = 0n;
  roleScopedMapId = 0n;
}
