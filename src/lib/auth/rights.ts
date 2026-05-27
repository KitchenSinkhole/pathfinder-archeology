// NOTE: deliberately no `import 'server-only'` — this module is imported by
// `src/lib/realtime/wsServer.ts`, which runs in the custom Node entry (tsx)
// without Next.js's `react-server` resolver condition. Under plain Node the
// `server-only` default export throws on load. Every caller is server-side
// (API routes, Server Actions, the WS upgrade handler); we rely on that
// rather than the marker package.
import { and, eq, exists, isNull, or, sql } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db } from '@/db/client';
import {
  apCharacter,
  apCharacterRole,
  apCorporationRight,
  apMap,
  apMapRoleAccess,
} from '@/db/schema';
import type { MapRight } from '@/types';

/**
 * Stage 15. The single rights module every controller imports. `requireSession`
 * still owns "is this user logged in"; this file answers "given an
 * authenticated character, can they perform action X on map Y".
 *
 * Reading rule (in order, first match wins for view; mutate combines view +
 * right grant):
 *   1. `authz_level='admin'` — global override, always wins.
 *   2. Owner match per `ap_map.type`:
 *        private  → `owner_character_id` matches the actor
 *        corp     → `owner_corporation_id` matches the actor's `corporation_id`
 *        alliance → `owner_alliance_id` matches the actor's `alliance_id`
 *   3. Role overlay — any `ap_character_role` row for the actor whose role
 *      appears in `ap_map_role_access` for the target map grants view access.
 *   4. Otherwise no access.
 *
 * For mutation: pass step 1-3 AND the right is granted by `ap_corporation_right`
 * for the actor's corp (with `min_authz_level <= actor's authz_level`), EXCEPT
 * `map_delete` / `map_share` which require owner-or-admin (not corp-right-grantable),
 * codifying the SPEC §11 Q8 fix.
 *
 * Maps with all three owner columns NULL (created before Stage 15 wiring) are
 * treated as admin-only — defensive default, surfaces unowned rows for repair.
 */

const AUTHZ_ORDINAL: Record<'member' | 'manager' | 'admin', number> = {
  member: 0,
  manager: 1,
  admin: 2,
};

interface ActorRow {
  authzLevel: 'member' | 'manager' | 'admin';
  status: 'active' | 'kicked' | 'banned';
  corporationId: bigint | null;
  allianceId: bigint | null;
}

async function loadActor(characterId: bigint): Promise<ActorRow | null> {
  const [row] = await db
    .select({
      authzLevel: apCharacter.authzLevel,
      status: apCharacter.status,
      corporationId: apCharacter.corporationId,
      allianceId: apCharacter.allianceId,
    })
    .from(apCharacter)
    .where(eq(apCharacter.id, characterId));
  return row ?? null;
}

interface MapRow {
  type: 'private' | 'corp' | 'alliance';
  ownerCharacterId: bigint | null;
  ownerCorporationId: bigint | null;
  ownerAllianceId: bigint | null;
}

async function loadMap(mapId: bigint): Promise<MapRow | null> {
  const [row] = await db
    .select({
      type: apMap.type,
      ownerCharacterId: apMap.ownerCharacterId,
      ownerCorporationId: apMap.ownerCorporationId,
      ownerAllianceId: apMap.ownerAllianceId,
    })
    .from(apMap)
    .where(and(eq(apMap.id, mapId), isNull(apMap.deletedAt)));
  return row ?? null;
}

function isOwner(actor: ActorRow, map: MapRow, characterId: bigint): boolean {
  switch (map.type) {
    case 'private':
      return map.ownerCharacterId !== null && map.ownerCharacterId === characterId;
    case 'corp':
      return (
        map.ownerCorporationId !== null &&
        actor.corporationId !== null &&
        map.ownerCorporationId === actor.corporationId
      );
    case 'alliance':
      return (
        map.ownerAllianceId !== null &&
        actor.allianceId !== null &&
        map.ownerAllianceId === actor.allianceId
      );
  }
}

async function hasRoleAccess(characterId: bigint, mapId: bigint): Promise<boolean> {
  const [row] = await db
    .select({ exists: sql<number>`1` })
    .from(apMapRoleAccess)
    .innerJoin(
      apCharacterRole,
      eq(apCharacterRole.roleId, apMapRoleAccess.roleId),
    )
    .where(
      and(
        eq(apMapRoleAccess.mapId, mapId),
        eq(apCharacterRole.characterId, characterId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Is the character allowed to *see* this map's data?
 * Returns `false` for non-existent or soft-deleted maps (treat as "no map").
 */
export async function canViewMap(characterId: bigint, mapId: bigint): Promise<boolean> {
  const actor = await loadActor(characterId);
  if (!actor || actor.status !== 'active') return false;
  if (actor.authzLevel === 'admin') return true;

  const map = await loadMap(mapId);
  if (!map) return false;

  // Unowned legacy map (all three owner columns NULL) → admin only.
  if (
    map.ownerCharacterId === null &&
    map.ownerCorporationId === null &&
    map.ownerAllianceId === null
  ) {
    return false;
  }

  if (isOwner(actor, map, characterId)) return true;
  if (await hasRoleAccess(characterId, mapId)) return true;
  return false;
}

/**
 * Is the character allowed to mutate this map with the given `right`?
 *
 * Two pathways depending on `ap_map.type`:
 *   - **`type='private'`** — the map's `owner_character_id` is the actor (or
 *     the actor is admin). The corp-right matrix does not apply: a private
 *     map's mutation surface is owner-only, period. Roles can grant view but
 *     never mutation.
 *   - **`type='corp'` / `'alliance'`** — the actor must (a) be allowed to view
 *     the map (corp/alliance owner match — *not* the role overlay; mutation
 *     by role is intentionally not granted, only view) and (b) have a matching
 *     `ap_corporation_right` row in the actor's own corp with
 *     `min_authz_level <= actor's authz_level`. Every right (`map_update`,
 *     `map_delete`, `map_share`, `map_import`, `map_export`) is grantable
 *     via this matrix — closing SPEC §11 Q8 by server-enforcing the same
 *     check the legacy UI assumed.
 *
 * `map_create` is checked by `canCreateMap` (no target map).
 */
export async function canMutateMap(
  characterId: bigint,
  mapId: bigint,
  right: MapRight,
): Promise<boolean> {
  if (right === 'map_create') {
    throw new Error('canMutateMap: map_create must be checked via canCreateMap');
  }

  const actor = await loadActor(characterId);
  if (!actor || actor.status !== 'active') return false;
  if (actor.authzLevel === 'admin') return true;

  const map = await loadMap(mapId);
  if (!map) return false;

  // Unowned legacy map (all three owner columns NULL) → admin only.
  if (
    map.ownerCharacterId === null &&
    map.ownerCorporationId === null &&
    map.ownerAllianceId === null
  ) {
    return false;
  }

  if (map.type === 'private') {
    return map.ownerCharacterId === characterId;
  }

  // type === 'corp' | 'alliance'. Require entity membership match against the
  // map's owner; the role overlay is view-only and does not unlock mutation.
  const memberOfOwner = isOwner(actor, map, characterId);
  if (!memberOfOwner) return false;

  if (actor.corporationId === null) return false;
  const [grant] = await db
    .select({ min: apCorporationRight.minAuthzLevel })
    .from(apCorporationRight)
    .where(
      and(
        eq(apCorporationRight.corporationId, actor.corporationId),
        eq(apCorporationRight.right, right),
      ),
    );
  if (!grant) return false;
  return AUTHZ_ORDINAL[actor.authzLevel] >= AUTHZ_ORDINAL[grant.min];
}

/**
 * Stage 15. Can this character spawn a new map? Pure corp-right check against
 * the actor's own corp; no per-target lookup. Admin always allowed.
 */
export async function canCreateMap(characterId: bigint): Promise<boolean> {
  const actor = await loadActor(characterId);
  if (!actor || actor.status !== 'active') return false;
  if (actor.authzLevel === 'admin') return true;
  if (actor.corporationId === null) return false;
  const [grant] = await db
    .select({ min: apCorporationRight.minAuthzLevel })
    .from(apCorporationRight)
    .where(
      and(
        eq(apCorporationRight.corporationId, actor.corporationId),
        eq(apCorporationRight.right, 'map_create'),
      ),
    );
  if (!grant) return false;
  return AUTHZ_ORDINAL[actor.authzLevel] >= AUTHZ_ORDINAL[grant.min];
}

/** True iff the active character has `authz_level='admin'` and is `active`. */
export async function isAdmin(session: Session | null | undefined): Promise<boolean> {
  if (!session?.characterId) return false;
  const actor = await loadActor(BigInt(session.characterId));
  return actor !== null && actor.status === 'active' && actor.authzLevel === 'admin';
}

/** Tuple-result helper for API routes — mirrors the existing `guardMap` shape. */
export type RightGuard =
  | { ok: true; characterId: bigint }
  | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * One-call gate for an API route handler. Resolves the session, the map
 * existence, and the right check in order. Returns a discriminated result
 * the caller can pass straight into `Response.json`.
 *
 * 401 — no session.
 * 404 — map missing / soft-deleted, OR the actor has no view access (avoid
 *       leaking existence; the legacy app returned 403 here which leaks).
 * 403 — the actor can see the map but lacks the right.
 */
export async function requireMapRight(
  session: Session | null | undefined,
  mapId: bigint,
  right: MapRight,
): Promise<RightGuard> {
  if (!session?.characterId) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }
  const characterId = BigInt(session.characterId);

  const canView = await canViewMap(characterId, mapId);
  if (!canView) {
    return { ok: false, status: 404, error: 'Map not found.' };
  }
  const canMutate = await canMutateMap(characterId, mapId, right);
  if (!canMutate) {
    return { ok: false, status: 403, error: 'Forbidden.' };
  }
  return { ok: true, characterId };
}

/** View-only guard for read endpoints. */
export async function requireMapView(
  session: Session | null | undefined,
  mapId: bigint,
): Promise<RightGuard> {
  if (!session?.characterId) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }
  const characterId = BigInt(session.characterId);
  const canView = await canViewMap(characterId, mapId);
  if (!canView) {
    return { ok: false, status: 404, error: 'Map not found.' };
  }
  return { ok: true, characterId };
}

/**
 * Server Action variant. Throws on failure so the call site can `await` it
 * inline. Use in Server Actions where a `redirect()` or thrown error is the
 * natural response (e.g. delete a map you don't own).
 */
export async function assertMapRight(
  session: Session | null | undefined,
  mapId: bigint,
  right: MapRight,
): Promise<bigint> {
  const guard = await requireMapRight(session, mapId, right);
  if (!guard.ok) {
    throw new RightAssertionError(guard.status, guard.error);
  }
  return guard.characterId;
}

export class RightAssertionError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'RightAssertionError';
  }
}

/**
 * SQL predicate for `listViewableMaps`. Returns a `where` clause that filters
 * `ap_map` rows to those the actor can view. Returns `undefined` for admins
 * (no filter — callers should still apply `isNull(deletedAt)`).
 */
export async function viewableMapPredicate(characterId: bigint) {
  const actor = await loadActor(characterId);
  if (!actor || actor.status !== 'active') {
    // No-actor predicate: tautologically false so the query returns no rows.
    return sql`false`;
  }
  if (actor.authzLevel === 'admin') {
    return undefined;
  }

  const ownerMatches: Array<ReturnType<typeof eq>> = [
    and(eq(apMap.type, 'private'), eq(apMap.ownerCharacterId, characterId))!,
  ];
  if (actor.corporationId !== null) {
    ownerMatches.push(
      and(eq(apMap.type, 'corp'), eq(apMap.ownerCorporationId, actor.corporationId))!,
    );
  }
  if (actor.allianceId !== null) {
    ownerMatches.push(
      and(eq(apMap.type, 'alliance'), eq(apMap.ownerAllianceId, actor.allianceId))!,
    );
  }

  // `EXISTS` join against role overlay.
  const roleAccess = exists(
    db
      .select({ one: sql<number>`1` })
      .from(apMapRoleAccess)
      .innerJoin(
        apCharacterRole,
        eq(apCharacterRole.roleId, apMapRoleAccess.roleId),
      )
      .where(
        and(
          eq(apMapRoleAccess.mapId, apMap.id),
          eq(apCharacterRole.characterId, characterId),
        ),
      ),
  );

  return or(...ownerMatches, roleAccess);
}

/** True iff the active character is `active` AND `authz_level >= 'manager'`. */
export async function isManagerOrAdmin(session: Session | null | undefined): Promise<boolean> {
  if (!session?.characterId) return false;
  const actor = await loadActor(BigInt(session.characterId));
  if (actor === null || actor.status !== 'active') return false;
  return AUTHZ_ORDINAL[actor.authzLevel] >= AUTHZ_ORDINAL.manager;
}

export type AdminVisibilityScope =
  | { kind: 'global' }
  | { kind: 'corp'; corporationId: bigint; allianceId: bigint | null };

/**
 * Scope primitive for admin-panel pages. Returns `null` for member/none so the
 * layout can redirect; admin → `{ kind: 'global' }`; manager → `{ kind: 'corp', corporationId, allianceId }`.
 * A manager row with `corporation_id IS NULL` is treated as no-scope (returns
 * null) — the row is broken and shouldn't see any panel content.
 */
export async function adminVisibilityScope(
  session: Session | null | undefined,
): Promise<AdminVisibilityScope | null> {
  if (!session?.characterId) return null;
  const actor = await loadActor(BigInt(session.characterId));
  if (actor === null || actor.status !== 'active') return null;
  if (actor.authzLevel === 'admin') return { kind: 'global' };
  if (actor.authzLevel === 'manager' && actor.corporationId !== null) {
    return { kind: 'corp', corporationId: actor.corporationId, allianceId: actor.allianceId };
  }
  return null;
}

/** Re-export for ergonomic imports at call sites. */
export type { Session };
