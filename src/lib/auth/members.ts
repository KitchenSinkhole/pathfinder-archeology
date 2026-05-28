import 'server-only';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { apCharacter } from '@/db/schema';
import { characterScopeFilterFor, type AdminVisibilityScope } from '@/lib/auth/rights';

/**
 * Row shape returned by `listAdminMembers`. Mirrors the `ap_character` columns
 * the `/admin/members` table renders plus the derived fields the action menu
 * needs to decide which controls to show (`status`, `authzLevel`).
 */
export type AdminMemberRow = {
  id: string;
  name: string;
  corporationId: string | null;
  allianceId: string | null;
  status: 'active' | 'kicked' | 'banned';
  statusExpiresAt: string | null;
  statusReason: string | null;
  statusChangedAt: string | null;
  authzLevel: 'member' | 'manager' | 'admin';
  lastOnline: boolean | null;
  lastLocationAt: string | null;
};

/**
 * Stage 16.3. Characters an admin / manager can act on. Scoped via
 * `characterScopeFilterFor` so a `global` scope returns every `ap_character`
 * and a `corp` scope returns only the manager's own corp.
 *
 * Ordering puts non-active rows first (banned, then kicked, then active) so
 * the admin sees actionable moderation state at the top of the table, then
 * alphabetises within each band.
 */
export async function listAdminMembers(
  scope: AdminVisibilityScope,
): Promise<AdminMemberRow[]> {
  const rows = await db
    .select({
      id: apCharacter.id,
      name: apCharacter.name,
      corporationId: apCharacter.corporationId,
      allianceId: apCharacter.allianceId,
      status: apCharacter.status,
      statusExpiresAt: apCharacter.statusExpiresAt,
      statusReason: apCharacter.statusReason,
      statusChangedAt: apCharacter.statusChangedAt,
      authzLevel: apCharacter.authzLevel,
      lastOnline: apCharacter.lastOnline,
      lastLocationAt: apCharacter.lastLocationAt,
    })
    .from(apCharacter)
    .where(characterScopeFilterFor(scope))
    .orderBy(asc(apCharacter.status), asc(apCharacter.name));

  return rows.map((r) => ({
    id: r.id.toString(),
    name: r.name,
    corporationId: r.corporationId === null ? null : r.corporationId.toString(),
    allianceId: r.allianceId === null ? null : r.allianceId.toString(),
    status: r.status,
    statusExpiresAt: r.statusExpiresAt === null ? null : r.statusExpiresAt.toISOString(),
    statusReason: r.statusReason,
    statusChangedAt: r.statusChangedAt === null ? null : r.statusChangedAt.toISOString(),
    authzLevel: r.authzLevel,
    lastOnline: r.lastOnline,
    lastLocationAt: r.lastLocationAt === null ? null : r.lastLocationAt.toISOString(),
  }));
}
