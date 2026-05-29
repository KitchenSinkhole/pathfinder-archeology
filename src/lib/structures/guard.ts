import 'server-only';
import type { Session } from 'next-auth';

/**
 * Single authorization chokepoint for structure-intel mutations. Structure intel
 * is deployment-global shared community data, so the policy is: **any
 * authenticated character may create/edit/delete.** Accountability comes from the
 * `ap_structure_event` audit log (every mutation is stamped with the actor), not
 * from a write gate. Keeping the policy in one function means tightening it later
 * (e.g. to a corp right) is a one-place change.
 */

export type StructureGuard =
  | { ok: true; characterId: bigint }
  | { ok: false; status: 401; error: string };

export function requireStructureMutate(session: Session | null | undefined): StructureGuard {
  if (!session?.characterId) {
    return { ok: false, status: 401, error: 'You must be signed in.' };
  }
  return { ok: true, characterId: BigInt(session.characterId) };
}
