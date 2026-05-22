'use server';

import { revalidatePath } from 'next/cache';
import { signIn, signOut, unstable_update } from '@/lib/auth';
import { requireSession, assertCharacterOwnership } from '@/lib/session';
import { setLinkCookie } from '@/lib/auth/link-cookie';

export type SwitchResult = { ok: true } | { ok: false; error: string };

/**
 * Make `targetCharacterId` the active character. Validates that it belongs to
 * the current account and is active, then re-issues the JWT via `unstable_update`
 * (the jwt callback re-validates as defense in depth).
 */
export async function switchCharacterAction(targetCharacterId: string): Promise<SwitchResult> {
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
  await unstable_update({ characterId: targetCharacterId });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Start the EVE OAuth flow to attach another character to the current account.
 * Sets the signed link cookie so the jwt callback links the new character to
 * this `userId` instead of minting a fresh account. Redirects to EVE SSO.
 */
export async function addCharacterAction(): Promise<void> {
  const session = await requireSession();
  await setLinkCookie(session.userId);
  await signIn('eve', { redirectTo: '/maps' });
}

/** Sign out and return to the public splash. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}
