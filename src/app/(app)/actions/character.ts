'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { signIn, signOut } from '@/lib/auth';
import { db } from '@/db/client';
import { apCharacter } from '@/db/schema';
import { requireSession, assertCharacterOwnership } from '@/lib/session';
import { setLinkCookie } from '@/lib/auth/link-cookie';
import { canViewMap } from '@/lib/auth/rights';
import { startTrackingCharacter, stopAllTrackingForCharacter } from '@/lib/jobs/tracking';

export type TrackingResult = { ok: true } | { ok: false; error: string };

/**
 * Enable or disable server-side location tracking for one of the account's
 * characters (Stage 17.5 follow-up — the Characters panel toggle). Validates
 * ownership, flips `ap_character.tracking_enabled`, then:
 *  - on **disable**, removes the character from tracking on every map (the poll
 *    self-terminates on its next tick);
 *  - on **enable**, if the user is currently viewing a map they can see, starts
 *    tracking that map immediately so the pilot appears without waiting for a
 *    re-subscribe; otherwise tracking resumes the next time a map is opened.
 *
 * `currentMapId` is the map the user has open (derived from the route), or null
 * when they aren't on a map.
 */
export async function setCharacterTrackingAction(
  characterId: string,
  enabled: boolean,
  currentMapId: string | null,
): Promise<TrackingResult> {
  const session = await requireSession();
  let target: bigint;
  try {
    target = BigInt(characterId);
  } catch {
    return { ok: false, error: 'Invalid character.' };
  }
  if (!(await assertCharacterOwnership(target, session.userId))) {
    return { ok: false, error: 'That character is not available on this account.' };
  }

  await db
    .update(apCharacter)
    .set({ trackingEnabled: enabled, updatedAt: new Date() })
    .where(eq(apCharacter.id, target));

  if (!enabled) {
    await stopAllTrackingForCharacter(target);
  } else if (currentMapId !== null) {
    let mapId: bigint | null = null;
    try {
      mapId = BigInt(currentMapId);
    } catch {
      mapId = null;
    }
    // View rights are the acting user's (they're the one looking at the map);
    // the enabled character is just being folded onto it.
    if (mapId !== null && (await canViewMap(BigInt(session.characterId), mapId))) {
      await startTrackingCharacter({ mapId, characterId: target });
    }
  }

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
