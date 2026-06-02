'use server';

import { and, eq } from 'drizzle-orm';
import { signIn, signOut } from '@/lib/auth';
import { db } from '@/db/client';
import { apCharacter, apMap, apMapCharacterTracking, apMapTrackingSeed } from '@/db/schema';
import { requireSession, assertCharacterOwnership } from '@/lib/session';
import { setLinkCookie } from '@/lib/auth/link-cookie';
import { canViewMap } from '@/lib/auth/rights';
import { startTrackingCharacter, stopTrackingCharacter } from '@/lib/jobs/tracking';

export type TrackingResult = { ok: true } | { ok: false; error: string };
export type MapTracking = { mapName: string | null; trackedIds: string[] };

/**
 * Track or untrack one of the account's characters on a **specific map** (the
 * Characters panel checkbox; per-map-character-tracking plan). Validates
 * ownership of the character and that the acting user can view the map, then
 * `startTrackingCharacter` (enable) / `stopTrackingCharacter` (disable) for that
 * one map.
 *
 * Before either, it ensures the `ap_map_tracking_seed` marker exists for this
 * `(map, account)` — so deselecting the *last* character leaves an empty
 * selection that the next `subscribe` won't mistake for a fresh map and
 * re-seed. The marker normally already exists (the user is on the map, which
 * seeds on subscribe); this is belt-and-braces.
 */
export async function setCharacterTrackingAction(
  characterId: string,
  mapId: string,
  enabled: boolean,
): Promise<TrackingResult> {
  const session = await requireSession();
  let target: bigint;
  let map: bigint;
  try {
    target = BigInt(characterId);
    map = BigInt(mapId);
  } catch {
    return { ok: false, error: 'Invalid character or map.' };
  }
  if (!(await assertCharacterOwnership(target, session.userId))) {
    return { ok: false, error: 'That character is not available on this account.' };
  }
  // View rights are the acting user's (they're the one looking at the map); the
  // tracked character is just being folded onto it.
  if (!(await canViewMap(BigInt(session.characterId), map))) {
    return { ok: false, error: 'That map is not available.' };
  }

  // Mark the map configured so an intentional empty selection survives the next
  // subscribe (the seed runs only when this marker is absent).
  await db
    .insert(apMapTrackingSeed)
    .values({ mapId: map, userId: session.userId })
    .onConflictDoNothing();

  if (enabled) {
    await startTrackingCharacter({ mapId: map, characterId: target });
  } else {
    await stopTrackingCharacter({ mapId: map, characterId: target });
  }

  return { ok: true };
}

/**
 * The account's tracked character ids on `mapId`, plus the map's display name,
 * for the Characters panel to initialize its per-map checkboxes when opened on
 * a map. Returns an empty selection if the acting user can't view the map or
 * the id is malformed.
 */
export async function getMapTrackingAction(mapId: string): Promise<MapTracking> {
  const session = await requireSession();
  let map: bigint;
  try {
    map = BigInt(mapId);
  } catch {
    return { mapName: null, trackedIds: [] };
  }
  if (!(await canViewMap(BigInt(session.characterId), map))) {
    return { mapName: null, trackedIds: [] };
  }

  const [mapRow] = await db.select({ name: apMap.name }).from(apMap).where(eq(apMap.id, map));

  const rows = await db
    .select({ characterId: apMapCharacterTracking.characterId })
    .from(apMapCharacterTracking)
    .innerJoin(apCharacter, eq(apCharacter.id, apMapCharacterTracking.characterId))
    .where(and(eq(apMapCharacterTracking.mapId, map), eq(apCharacter.userId, session.userId)));

  return { mapName: mapRow?.name ?? null, trackedIds: rows.map((r) => r.characterId.toString()) };
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
