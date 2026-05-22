import 'server-only';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { universeSystem, universeSystemStatic, universeWormhole } from '@/db/schema';

/**
 * Wormhole-catalog lookups for the two SPEC §6.4 product use-cases:
 *   1. class-filtered WH-type suggestion when marking a signature as a wormhole;
 *   2. "mark as static" — identifying which of a system's statics a connection is.
 *
 * Class join key: `universe_system.security` (the C1–C6 / HS / LS / NS labels),
 * NOT `universe_system.security_class`. SPEC §6.4 pins `universe_wormhole`'s
 * `source_class`/`target_class` to "the same labels as universe_system.security",
 * and the seeded catalog uses exactly those (e.g. a C3 static carries
 * `source_class = 'C3'`). `security_class` is the unrelated SDE ore-spawn field.
 */

export type WormholeTypeOption = {
  typeId: number;
  /** WH code, e.g. `A239`, `K162`. */
  name: string;
  /** Class it can appear in; null = any (the universal K162 reverse-exit). */
  sourceClass: string | null;
  /** Class it leads into; null = resolved from the far side. */
  targetClass: string | null;
};

export type StaticMatch = {
  typeId: number;
  name: string;
  /** The static's destination class — equals the target system's class on a match. */
  targetClass: string | null;
};

/**
 * Wormhole types that can appear in a given system, for the WH-type dropdown.
 * Returns every catalog row whose `source_class` is null (appears anywhere —
 * includes the universal `K162`) or equals the system's class label, ordered by
 * code. An unknown `systemId` yields `[]`.
 */
export async function wormholeTypesForSystem(systemId: number): Promise<WormholeTypeOption[]> {
  const [system] = await db
    .select({ security: universeSystem.security })
    .from(universeSystem)
    .where(eq(universeSystem.id, systemId));
  if (!system) return [];

  const where =
    system.security == null
      ? isNull(universeWormhole.sourceClass)
      : or(
          isNull(universeWormhole.sourceClass),
          eq(universeWormhole.sourceClass, system.security),
        );

  return db
    .select({
      typeId: universeWormhole.typeId,
      name: universeWormhole.name,
      sourceClass: universeWormhole.sourceClass,
      targetClass: universeWormhole.targetClass,
    })
    .from(universeWormhole)
    .where(where)
    .orderBy(universeWormhole.name);
}

/**
 * "Mark as static": which of the source system's statics lead into the target
 * system's class. Resolves the target system's class label, then matches it
 * against each of the source system's `universe_system_static` rows via
 * `universe_wormhole.target_class`. Returns every matching static (a system can
 * have more than one); empty when nothing matches or the target class is unknown.
 */
export async function staticMatchForConnection(args: {
  /** System the connection leaves from (the one whose statics we check). */
  sourceSystemId: number;
  /** System the connection leads into. */
  targetSystemId: number;
}): Promise<StaticMatch[]> {
  const [target] = await db
    .select({ security: universeSystem.security })
    .from(universeSystem)
    .where(eq(universeSystem.id, args.targetSystemId));
  if (!target?.security) return [];

  return db
    .select({
      typeId: universeWormhole.typeId,
      name: universeWormhole.name,
      targetClass: universeWormhole.targetClass,
    })
    .from(universeSystemStatic)
    .innerJoin(universeWormhole, eq(universeSystemStatic.typeId, universeWormhole.typeId))
    .where(
      and(
        eq(universeSystemStatic.systemId, args.sourceSystemId),
        eq(universeWormhole.targetClass, target.security),
      ),
    );
}
