'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { apCharacter } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
  adminVisibilityScope,
  characterScopeFilterFor,
  isAdmin,
  isManagerOrAdmin,
  type AdminVisibilityScope,
} from '@/lib/auth/rights';

/**
 * Stage 16.3 admin actions on `ap_character` rows: moderation
 * (`kick` / `ban` / `activate`) and authz toggle
 * (`grantManager` / `revokeManager`). Gated by `isManagerOrAdmin` +
 * `adminVisibilityScope`; the two authz actions further require `isAdmin`
 * (managers may moderate within their corp but cannot mint other managers).
 *
 * All five actions write directly to `ap_character` without an audit row —
 * `ap_map_event` is map-scoped (see Stage 16 plan, "What is intentionally NOT
 * in scope"). The dashboard counts in `/admin` reflect the new state on next
 * load via `revalidatePath`.
 */

const characterIdSchema = z.string().regex(/^\d+$/, 'Invalid character id.');
const kickMinutesSchema = z.union([
  z.literal(5),
  z.literal(60),
  z.literal(1440),
]);
const reasonSchema = z.string().trim().min(1).max(500);
const optionalReasonSchema = z
  .string()
  .trim()
  .max(500)
  .transform((s) => (s.length === 0 ? null : s))
  .nullable()
  .optional();

type ActionResult = { ok: true } | { ok: false; error: string };

type TargetRow = {
  id: bigint;
  status: 'active' | 'kicked' | 'banned';
  authzLevel: 'member' | 'manager' | 'admin';
};

async function selectScopedCharacter(
  id: bigint,
  scope: AdminVisibilityScope,
): Promise<TargetRow | null> {
  const where = and(eq(apCharacter.id, id), characterScopeFilterFor(scope));
  const [row] = await db
    .select({
      id: apCharacter.id,
      status: apCharacter.status,
      authzLevel: apCharacter.authzLevel,
    })
    .from(apCharacter)
    .where(where);
  return row ?? null;
}

async function gateManagerOrAdmin(): Promise<
  | { ok: true; scope: AdminVisibilityScope }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!(await isManagerOrAdmin(session))) {
    return { ok: false, error: 'Forbidden.' };
  }
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Forbidden.' };
  return { ok: true, scope };
}

async function gateAdmin(): Promise<
  | { ok: true; scope: AdminVisibilityScope }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!(await isAdmin(session))) {
    return { ok: false, error: 'Admin required.' };
  }
  // Admin scope is always `global`; we still call the helper for the type.
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Admin required.' };
  return { ok: true, scope };
}

/**
 * Set `status='kicked'` with a fixed-minutes timeout. The `character-cleanup`
 * cron flips the row back to `'active'` on expiry (`src/lib/jobs/tasks/characterCleanup.ts`).
 * Three durations only — 5, 60, 1440 minutes — per the Stage 16 plan.
 */
export async function adminKickCharacter(
  characterId: string,
  minutes: 5 | 60 | 1440,
  reason?: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };
  const parsedMinutes = kickMinutesSchema.safeParse(minutes);
  if (!parsedMinutes.success) return { ok: false, error: 'Invalid kick duration.' };
  const parsedReason = optionalReasonSchema.safeParse(reason);
  if (!parsedReason.success) return { ok: false, error: 'Invalid reason.' };

  const gate = await gateManagerOrAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  await db
    .update(apCharacter)
    .set({
      status: 'kicked',
      statusExpiresAt: sql`now() + (${parsedMinutes.data} * interval '1 minute')`,
      statusReason: parsedReason.data ?? null,
      statusChangedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(apCharacter.id, id));

  revalidatePath('/admin/members');
  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Set `status='banned'` permanently — `status_expires_at` stays NULL so the
 * `character-cleanup` cron never lifts it. A free-text `reason` is required.
 */
export async function adminBanCharacter(
  characterId: string,
  reason: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return { ok: false, error: 'Reason is required.' };

  const gate = await gateManagerOrAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  await db
    .update(apCharacter)
    .set({
      status: 'banned',
      statusExpiresAt: null,
      statusReason: parsedReason.data,
      statusChangedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(apCharacter.id, id));

  revalidatePath('/admin/members');
  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Clear any moderation state — works on both `'kicked'` and `'banned'` rows.
 * Sets `status='active'` and nulls `status_expires_at` / `status_reason`.
 */
export async function adminActivateCharacter(
  characterId: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };

  const gate = await gateManagerOrAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  await db
    .update(apCharacter)
    .set({
      status: 'active',
      statusExpiresAt: null,
      statusReason: null,
      statusChangedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(apCharacter.id, id));

  revalidatePath('/admin/members');
  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Admin-only. Promote a `'member'` row to `'manager'`. `syncCharacterAuthz`
 * preserves the `'manager'` value via its `CASE WHEN authz_level = 'manager'`
 * clause (`src/lib/auth/syncCharacterAuthz.ts`), so the grant survives every
 * subsequent ESI resync. No-op when the row is already `'manager'`; refused
 * when it is `'admin'` (admin is derived from ESI Director and not
 * grant-toggled).
 */
export async function adminGrantManager(
  characterId: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };

  const gate = await gateAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  if (target.authzLevel === 'admin') {
    return { ok: false, error: 'Admin status is derived from ESI; not grant-toggled.' };
  }
  if (target.authzLevel === 'manager') {
    return { ok: true };
  }

  await db
    .update(apCharacter)
    .set({ authzLevel: 'manager', updatedAt: sql`now()` })
    .where(and(eq(apCharacter.id, id), eq(apCharacter.authzLevel, 'member')));

  revalidatePath('/admin/members');
  return { ok: true };
}

/**
 * Admin-only. Demote a `'manager'` row back to `'member'`. Refuses to act on
 * `'admin'` rows — those are Director-derived; revoking the Director title in
 * EVE is the only path to clearing admin.
 */
export async function adminRevokeManager(
  characterId: string,
): Promise<ActionResult> {
  const parsedId = characterIdSchema.safeParse(characterId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]!.message };

  const gate = await gateAdmin();
  if (!gate.ok) return gate;
  const id = BigInt(parsedId.data);
  const target = await selectScopedCharacter(id, gate.scope);
  if (target === null) return { ok: false, error: 'Character not found.' };

  if (target.authzLevel === 'admin') {
    return { ok: false, error: 'Cannot revoke admin — derived from ESI Director.' };
  }
  if (target.authzLevel === 'member') {
    return { ok: true };
  }

  await db
    .update(apCharacter)
    .set({ authzLevel: 'member', updatedAt: sql`now()` })
    .where(and(eq(apCharacter.id, id), eq(apCharacter.authzLevel, 'manager')));

  revalidatePath('/admin/members');
  return { ok: true };
}
