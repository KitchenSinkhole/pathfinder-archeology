import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { apCorporation, apCorporationRight, mapRight } from '@/db/schema';
import type { AdminVisibilityScope } from '@/lib/auth/rights';
import type { AuthzLevel, MapRight } from '@/types';

/**
 * Stage 16.5 — read-side helpers for the `/admin/settings` corp-rights matrix.
 *
 * The matrix is `ap_corporation_right` rendered as 6 rights × 4-state radios
 * (none + the three `authz_level` rungs). "None" maps to no row in the table;
 * `member` / `manager` / `admin` map to a row whose `min_authz_level` ordinal
 * is the floor for exercising that right.
 */

/** A single corporation row scoped to what the admin/manager may see. */
export type AdminCorpRow = {
  id: string;
  name: string;
  allianceId: string | null;
};

/** One cell in the matrix — `null` for no grant, otherwise the threshold. */
export type CorpRightCell = {
  right: MapRight;
  minAuthzLevel: AuthzLevel | null;
};

/**
 * The full six-right matrix for a single corp. Always returns all six rights;
 * missing rows surface as `minAuthzLevel: null` so the UI can render the
 * "none" column without a second query.
 */
export type CorpRightsMatrix = {
  corporationId: string;
  rights: CorpRightCell[];
};

const ALL_RIGHTS: readonly MapRight[] = mapRight.enumValues;

/**
 * Corps an admin / manager may pick in the corp picker.
 * - `global` → every `ap_corporation` row, alphabetical.
 * - `corp`   → exactly the one corp the manager belongs to.
 */
export async function listCorpsForAdmin(
  scope: AdminVisibilityScope,
): Promise<AdminCorpRow[]> {
  const base = db
    .select({
      id: apCorporation.id,
      name: apCorporation.name,
      allianceId: apCorporation.allianceId,
    })
    .from(apCorporation);

  const rows =
    scope.kind === 'global'
      ? await base.orderBy(asc(apCorporation.name))
      : await base.where(eq(apCorporation.id, scope.corporationId));

  return rows.map((r) => ({
    id: r.id.toString(),
    name: r.name,
    allianceId: r.allianceId === null ? null : r.allianceId.toString(),
  }));
}

/**
 * Load the matrix for a single corp. Joins the six possible rights against
 * the rows that actually exist in `ap_corporation_right`; absent rights come
 * back as `minAuthzLevel: null` so the matrix is always six entries wide.
 */
export async function loadCorpRightsMatrix(
  corporationId: bigint,
): Promise<CorpRightsMatrix> {
  const rows = await db
    .select({
      right: apCorporationRight.right,
      minAuthzLevel: apCorporationRight.minAuthzLevel,
    })
    .from(apCorporationRight)
    .where(eq(apCorporationRight.corporationId, corporationId));

  const byRight = new Map<MapRight, AuthzLevel>();
  for (const row of rows) byRight.set(row.right, row.minAuthzLevel);

  return {
    corporationId: corporationId.toString(),
    rights: ALL_RIGHTS.map((right) => ({
      right,
      minAuthzLevel: byRight.get(right) ?? null,
    })),
  };
}
