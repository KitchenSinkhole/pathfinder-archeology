import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { apertureConfig } from '../../../aperture.config';
import { db } from '@/db/client';
import {
  apCharacter,
  apCharacterRole,
  apCorporation,
  apRole,
} from '@/db/schema';
import {
  esiCall,
  EsiBreakerOpenError,
  EsiDowntimeError,
  EsiHttpError,
  EsiTokenError,
} from '@/lib/esi/client';
import {
  characterPublicSchema,
  characterRolesSchema,
  characterTitlesSchema,
  type EsiCharacterRoles,
  type EsiCharacterTitles,
} from '@/lib/esi/decoders';

/**
 * Stage 15. Reconcile one character's derived authority state against ESI in
 * a single transactional pass. Three pieces of state are touched:
 *
 *   1. `ap_character.authz_level`         — `'admin'` iff ESI returns the
 *                                            `AUTHZ_ADMIN_ROLE` ('Director')
 *                                            corp role; else `'member'`.
 *                                            Existing `'manager'` values are
 *                                            left alone (those come from
 *                                            explicit admin-panel grants and
 *                                            are never derived).
 *   2. `ap_character.corporation_id` /
 *      `ap_character.alliance_id`         — refreshed from `getCharacter`.
 *                                            `ap_corporation` row upserted as
 *                                            a side effect (FK target for
 *                                            `ap_corporation_right` + role rows).
 *   3. `ap_character_role` rows tagged
 *      `source='corp_title'`              — reconciled to match the titles ESI
 *                                            returns; roles upserted into
 *                                            `ap_role`, memberships inserted
 *                                            for newly-held titles, deleted for
 *                                            titles no longer held.
 *
 * Called from:
 *   - The Auth.js JWT callback on initial sign-in (`src/lib/auth.ts`).
 *   - The Stage 15.6 `character-cleanup` job on its periodic resync pass.
 *
 * ESI-failure modes are caught by the caller's choice of policy; this helper
 * propagates them as-is (`EsiBreakerOpenError`, `EsiDowntimeError`,
 * `EsiHttpError`, `EsiTokenError`). On any of those, the function aborts
 * before mutating the DB so a partial sync never lands.
 */
export interface SyncCharacterAuthzResult {
  authzLevel: 'member' | 'manager' | 'admin';
  isDirector: boolean;
  corporationId: bigint | null;
  allianceId: bigint | null;
  titleCount: number;
  /** `true` when ESI was reachable and the DB was updated. */
  applied: boolean;
  /** Reason the sync was skipped (when `applied === false`). */
  skipped?: 'esi-breaker' | 'esi-downtime' | 'esi-http' | 'no-token';
}

export async function syncCharacterAuthz(
  characterId: bigint,
): Promise<SyncCharacterAuthzResult> {
  let publicProfile, roles: EsiCharacterRoles, titles: EsiCharacterTitles;
  try {
    [publicProfile, roles, titles] = await Promise.all([
      esiCall('getCharacter', {
        schema: characterPublicSchema,
        pathParams: { character_id: characterId },
      }),
      esiCall('getCharacterRoles', {
        schema: characterRolesSchema,
        pathParams: { character_id: characterId },
        characterId,
      }),
      esiCall('getCharacterTitles', {
        schema: characterTitlesSchema,
        pathParams: { character_id: characterId },
        characterId,
      }),
    ]);
  } catch (err) {
    if (err instanceof EsiBreakerOpenError) {
      return emptyResult({ skipped: 'esi-breaker' });
    }
    if (err instanceof EsiDowntimeError) {
      return emptyResult({ skipped: 'esi-downtime' });
    }
    if (err instanceof EsiTokenError) {
      return emptyResult({ skipped: 'no-token' });
    }
    if (err instanceof EsiHttpError) {
      return emptyResult({ skipped: 'esi-http' });
    }
    throw err;
  }

  const isDirector = (roles.roles ?? []).includes(apertureConfig.AUTHZ_ADMIN_ROLE);
  const corporationId = BigInt(publicProfile.corporation_id);
  const allianceId =
    publicProfile.alliance_id !== undefined ? BigInt(publicProfile.alliance_id) : null;

  await db.transaction(async (tx) => {
    // 1. Upsert the corp row so subsequent FK targets resolve.
    await tx
      .insert(apCorporation)
      .values({
        id: corporationId,
        name: `corp:${corporationId}`,
        allianceId,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: apCorporation.id,
        // Refresh affiliation + sync timestamp but do not stomp `name`
        // (the dedicated corp-name resolver fills it in later; this helper
        // is character-driven and may not know the corp's real name).
        set: {
          allianceId,
          lastSyncedAt: new Date(),
        },
      });

    // 2. Update the character row. `authz_level` follows the Director rule
    //    except when the existing value is `'manager'` (hand-assigned via
    //    admin panel) — leave that alone so admin grants survive resyncs.
    const desiredAuthz: 'admin' | 'member' = isDirector ? 'admin' : 'member';
    await tx
      .update(apCharacter)
      .set({
        corporationId,
        allianceId,
        // CASE preserves `manager`; sets admin/member otherwise.
        authzLevel: sql`CASE WHEN ${apCharacter.authzLevel} = 'manager' THEN 'manager'::authz_level ELSE ${desiredAuthz}::authz_level END`,
        authzSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(apCharacter.id, characterId));

    // 3. Reconcile corp-title roles. Each ESI title → one `ap_role` row
    //    keyed by `(source='corp_title', external_ref='<corp_id>:<title_id>')`.
    //    Memberships in `ap_character_role` are inserted for newly held
    //    titles and deleted for titles no longer present.
    const desiredRefs = titles.map((t) => corpTitleRef(corporationId, t.title_id));

    if (titles.length > 0) {
      // Upsert each role row. ESI is the source of truth for `name`.
      for (const t of titles) {
        await tx
          .insert(apRole)
          .values({
            source: 'corp_title',
            externalRef: corpTitleRef(corporationId, t.title_id),
            name: t.name,
            corporationId,
          })
          .onConflictDoUpdate({
            target: [apRole.source, apRole.externalRef],
            set: { name: t.name, corporationId },
          });
      }

      // Resolve every desired role's id, then insert any missing memberships.
      const desiredRoles = await tx
        .select({ id: apRole.id, externalRef: apRole.externalRef })
        .from(apRole)
        .where(
          and(
            eq(apRole.source, 'corp_title'),
            inArray(apRole.externalRef, desiredRefs),
          ),
        );
      for (const r of desiredRoles) {
        await tx
          .insert(apCharacterRole)
          .values({
            characterId,
            roleId: r.id,
            grantedBy: 'corp-title-sync',
          })
          .onConflictDoNothing({
            target: [apCharacterRole.characterId, apCharacterRole.roleId],
          });
      }
    }

    // 4. Drop memberships for corp-title roles the character no longer holds.
    //    Restrict to `corp_title` source so admin/external grants survive.
    //    Postgres can chain CTEs but a sub-select keeps this readable; the
    //    join is cheap (PK on character_id + secondary index on role_id).
    if (desiredRefs.length === 0) {
      await tx
        .delete(apCharacterRole)
        .where(
          and(
            eq(apCharacterRole.characterId, characterId),
            inArray(
              apCharacterRole.roleId,
              tx
                .select({ id: apRole.id })
                .from(apRole)
                .where(eq(apRole.source, 'corp_title')),
            ),
          ),
        );
    } else {
      await tx
        .delete(apCharacterRole)
        .where(
          and(
            eq(apCharacterRole.characterId, characterId),
            inArray(
              apCharacterRole.roleId,
              tx
                .select({ id: apRole.id })
                .from(apRole)
                .where(
                  and(
                    eq(apRole.source, 'corp_title'),
                    notInArray(apRole.externalRef, desiredRefs),
                  ),
                ),
            ),
          ),
        );
    }
  });

  return {
    authzLevel: isDirector ? 'admin' : 'member',
    isDirector,
    corporationId,
    allianceId,
    titleCount: titles.length,
    applied: true,
  };
}

function corpTitleRef(corporationId: bigint, titleId: number): string {
  return `${corporationId.toString()}:${titleId}`;
}

function emptyResult(
  init: Pick<SyncCharacterAuthzResult, 'skipped'>,
): SyncCharacterAuthzResult {
  return {
    authzLevel: 'member',
    isDirector: false,
    corporationId: null,
    allianceId: null,
    titleCount: 0,
    applied: false,
    ...init,
  };
}
