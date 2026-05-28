'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { apCorporation, apCorporationRight, authzLevel, mapRight } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
  adminVisibilityScope,
  isManagerOrAdmin,
  type AdminVisibilityScope,
} from '@/lib/auth/rights';

/**
 * Stage 16.5 admin actions on `ap_corporation_right`. Two operations exposed
 * at `/admin/settings`: upsert one (corp, right) row to a new
 * `min_authz_level`, or delete the row (= no grant for that right on that
 * corp).
 *
 * Gated by `isManagerOrAdmin` + scope: a manager can only edit rows whose
 * `corporation_id` matches their own corp; an admin can edit any corp.
 *
 * No `ap_map_event` row is written — corp-right config is not map state. The
 * panel is refreshed via `revalidatePath('/admin/settings')` so subsequent
 * page loads see the new matrix.
 */

const corpIdSchema = z.string().regex(/^\d+$/, 'Invalid corporation id.');
const rightSchema = z.enum(mapRight.enumValues);
const minAuthzSchema = z.enum(authzLevel.enumValues);

type ActionResult = { ok: true } | { ok: false; error: string };

async function gateForCorp(
  corporationId: bigint,
): Promise<
  | { ok: true; scope: AdminVisibilityScope }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!(await isManagerOrAdmin(session))) {
    return { ok: false, error: 'Forbidden.' };
  }
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Forbidden.' };

  if (scope.kind === 'corp' && scope.corporationId !== corporationId) {
    return { ok: false, error: 'Corporation not found.' };
  }

  const [row] = await db
    .select({ id: apCorporation.id })
    .from(apCorporation)
    .where(eq(apCorporation.id, corporationId));
  if (!row) return { ok: false, error: 'Corporation not found.' };
  return { ok: true, scope };
}

const upsertSchema = z.object({
  corporationId: corpIdSchema,
  right: rightSchema,
  minAuthzLevel: minAuthzSchema,
});

/**
 * Insert-or-update one `(corp, right)` row. Primary key is
 * `(corporation_id, right)` so the `ON CONFLICT` target writes a fresh
 * `min_authz_level`. Manager scope: `corporationId === actor.corporationId`.
 * Admin scope: any corp.
 */
export async function adminUpsertCorpRight(
  input: z.input<typeof upsertSchema>,
): Promise<ActionResult> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const corporationId = BigInt(parsed.data.corporationId);
  const gate = await gateForCorp(corporationId);
  if (!gate.ok) return gate;

  await db
    .insert(apCorporationRight)
    .values({
      corporationId,
      right: parsed.data.right,
      minAuthzLevel: parsed.data.minAuthzLevel,
    })
    .onConflictDoUpdate({
      target: [apCorporationRight.corporationId, apCorporationRight.right],
      set: { minAuthzLevel: parsed.data.minAuthzLevel },
    });

  revalidatePath('/admin/settings');
  return { ok: true };
}

const deleteSchema = z.object({
  corporationId: corpIdSchema,
  right: rightSchema,
});

/**
 * Delete one `(corp, right)` row. Same scope rule as upsert. No-op when the
 * row is already absent (the matrix UI treats both as "none").
 */
export async function adminDeleteCorpRight(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const corporationId = BigInt(parsed.data.corporationId);
  const gate = await gateForCorp(corporationId);
  if (!gate.ok) return gate;

  await db
    .delete(apCorporationRight)
    .where(
      and(
        eq(apCorporationRight.corporationId, corporationId),
        eq(apCorporationRight.right, parsed.data.right),
      ),
    );

  revalidatePath('/admin/settings');
  return { ok: true };
}
