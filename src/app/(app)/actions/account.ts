'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { apUser } from '@/db/schema';
import { signOut } from '@/lib/auth';
import { assertCharacterOwnership, requireSession } from '@/lib/session';

// Account self-service (Stage 17.5). Low-frequency, user-initiated state changes
// over ap_user — Server Actions per the CLAUDE.md mutation pathways.

export type AccountActionResult = { ok: true } | { ok: false; error: string };

/**
 * Set the account's main character — the identity login lands on and that
 * statistics / activity roll up to. The target must be an active character on
 * the current account.
 */
export async function setMainCharacterAction(
  targetCharacterId: string,
): Promise<AccountActionResult> {
  const session = await requireSession();
  let target: bigint;
  try {
    target = BigInt(targetCharacterId);
  } catch {
    return { ok: false, error: 'Invalid character.' };
  }
  if (!(await assertCharacterOwnership(target, session.userId))) {
    return { ok: false, error: 'That character is not available on this account.' };
  }
  await db
    .update(apUser)
    .set({ mainCharacterId: target, updatedAt: new Date() })
    .where(eq(apUser.id, session.userId));
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Toggle the per-account connection travel animation (the subtle moving dot
 * played on a connection when a tracked pilot jumps across it). Persisted on
 * `ap_user`; the per-map row stays untouched because the preference is personal,
 * not shared with other viewers of the map.
 */
export async function setConnectionTravelAnimationAction(
  enabled: boolean,
): Promise<AccountActionResult> {
  const session = await requireSession();
  await db
    .update(apUser)
    .set({ connectionTravelAnimation: enabled, updatedAt: new Date() })
    .where(eq(apUser.id, session.userId));
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Delete the account and every character on it. The FK rules do the rest:
 * characters / roles / tracking cascade away, audit rows (`ap_map_event`,
 * `ap_structure_event`) keep their history with `character_id` set null, and
 * owned maps are orphaned (`owner_character_id` set null). Irreversible — there
 * is no soft-delete grace for accounts. On success the user is signed out and
 * returned to the public splash (`signOut` throws a redirect and never returns).
 */
export async function deleteAccountAction(): Promise<AccountActionResult> {
  const session = await requireSession();
  try {
    await db.delete(apUser).where(eq(apUser.id, session.userId));
  } catch {
    return { ok: false, error: 'Could not delete account.' };
  }
  await signOut({ redirectTo: '/' });
  return { ok: true };
}
