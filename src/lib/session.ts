import 'server-only';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { apCharacter, apUser } from '@/db/schema';

// Server-only account/session helpers. Everything map- and chrome-level reads
// the active character and the account's character roster through here so the
// ownership rule lives in exactly one place. SPEC §7 (stateless JWT sessions).

export type AccountCharacter = {
  id: string;
  name: string;
  status: (typeof apCharacter.$inferSelect)['status'];
  authzLevel: (typeof apCharacter.$inferSelect)['authzLevel'];
  trackingEnabled: boolean;
};

/** The current Auth.js session, or `null` when logged out. */
export async function getSession(): Promise<Session | null> {
  return auth();
}

/**
 * The current session; `redirect('/')` to the public splash when absent **or**
 * when the active character's `status !== 'active'` (Stage 16.3 — kicked /
 * banned characters lose every gated route on their next request, not just
 * the next sign-in).
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session?.characterId) redirect('/');
  const [row] = await db
    .select({ status: apCharacter.status })
    .from(apCharacter)
    .where(eq(apCharacter.id, BigInt(session.characterId)));
  if (row === undefined || row.status !== 'active') redirect('/');
  return session;
}

/** The full `ap_character` row for the active character, or `null`. */
export async function getActiveCharacter() {
  const session = await getSession();
  if (!session?.characterId) return null;
  const [row] = await db
    .select()
    .from(apCharacter)
    .where(eq(apCharacter.id, BigInt(session.characterId)));
  return row ?? null;
}

/**
 * Every character on the account, ordered by name. Returns only display-safe
 * fields — ESI tokens never leave the DB layer.
 */
export async function getAccountCharacters(userId: number): Promise<AccountCharacter[]> {
  const rows = await db
    .select({
      id: apCharacter.id,
      name: apCharacter.name,
      status: apCharacter.status,
      authzLevel: apCharacter.authzLevel,
      trackingEnabled: apCharacter.trackingEnabled,
    })
    .from(apCharacter)
    .where(eq(apCharacter.userId, userId))
    .orderBy(apCharacter.name);
  return rows.map((r) => ({ ...r, id: r.id.toString() }));
}

/**
 * The account's main character id as a string (bigint isn't JSON-safe), or
 * `null` when unset. Drives the Account Settings "main" selector (Stage 17.5).
 */
export async function getMainCharacterId(userId: number): Promise<string | null> {
  const [row] = await db
    .select({ mainCharacterId: apUser.mainCharacterId })
    .from(apUser)
    .where(eq(apUser.id, userId));
  return row?.mainCharacterId != null ? row.mainCharacterId.toString() : null;
}

/**
 * Whether `characterId` belongs to `userId` and is currently `active`. The
 * single source of truth for the character-switch authorization check, reused
 * by the switch Server Action and (defensively) the jwt callback.
 */
export async function assertCharacterOwnership(
  characterId: bigint,
  userId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ status: apCharacter.status })
    .from(apCharacter)
    .where(and(eq(apCharacter.id, characterId), eq(apCharacter.userId, userId)));
  return row?.status === 'active';
}
