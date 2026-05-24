import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { universeStargateEdge } from '@/db/schema';

/**
 * Pure jump classifier consumed by the Stage 12.2 location-poll. Decides
 * whether a transition between two systems is a gate jump (ignore — gates are
 * already on every map by virtue of `universe_stargate_edge`) or a wormhole
 * jump (fold onto the character's tracked maps as `system.added` /
 * `connection.create` events).
 *
 * Single PK probe against `universe_stargate_edge` in either direction; no
 * recursion, no path-finding. The edge table is bidirectional in practice
 * (each stargate pair lives as two rows) but we check both orderings
 * defensively in case a future SDE ingest stops mirroring them.
 *
 * Classifications outside `gate`/`wormhole` (e.g. cyno, jump bridge, abyssal
 * trace) are NOT modelled here — the rebuild treats every non-gate transition
 * as a wormhole. Those rarer cases land alongside the broader intel module
 * work in later stages.
 */

export type JumpClass = 'gate' | 'wormhole';

export interface ClassifyJumpArgs {
  fromSystemId: number;
  toSystemId: number;
}

export async function classifyJump(args: ClassifyJumpArgs): Promise<JumpClass> {
  if (args.fromSystemId === args.toSystemId) {
    // Defensive: caller should never invoke with the same id, but if they do
    // it's plainly not a jump — return 'gate' so no map writes happen.
    return 'gate';
  }
  const adjacent = await db.execute<{ adjacent: boolean }>(
    sql`SELECT EXISTS (
          SELECT 1 FROM universe_stargate_edge
          WHERE (from_system_id = ${args.fromSystemId} AND to_system_id = ${args.toSystemId})
             OR (from_system_id = ${args.toSystemId} AND to_system_id = ${args.fromSystemId})
        ) AS adjacent`,
  );
  return adjacent.rows[0]?.adjacent ? 'gate' : 'wormhole';
}

/**
 * Drizzle-builder equivalent of the EXISTS query, exposed for callers that
 * want to compose it into a larger query (e.g. a future bulk classifier).
 * Not used by `classifyJump` itself because the raw form reads more clearly.
 */
export function gateAdjacencyCondition(fromSystemId: number, toSystemId: number) {
  return or(
    and(
      eq(universeStargateEdge.fromSystemId, fromSystemId),
      eq(universeStargateEdge.toSystemId, toSystemId),
    ),
    and(
      eq(universeStargateEdge.fromSystemId, toSystemId),
      eq(universeStargateEdge.toSystemId, fromSystemId),
    ),
  );
}
