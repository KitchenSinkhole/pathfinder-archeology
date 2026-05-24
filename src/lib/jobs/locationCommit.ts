import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMapConnection, apMapSystem } from '@/db/schema';
import { commitMapEvent } from '@/lib/map/mutations/core';
import { buildSystemNode } from '@/lib/map/systemNode';

/**
 * Stage 12.2. The per-map fold for a detected wormhole jump from the
 * location-poll. Wraps the three `commitMapEvent` calls that turn
 * "character moved from system A to system B" into the same set of events a
 * user-driven `addSystem` + `addSystem` + `createConnection` would produce —
 * minus the events that would be redundant.
 *
 * Idempotency rules (sub-stage 12.2 decision):
 *   - If a `ap_map_system` row already exists with `visible = true`, no
 *     `system.added` event is emitted (the system is already on the canvas).
 *   - If a `ap_map_connection` already links the two endpoints in either
 *     direction, no `connection.create` event is emitted (the operator may
 *     have placed it manually, or a prior poll tick already laid it down).
 *
 * Each commit is its own transaction (Stage 9 pattern). A failure between
 * commits leaves a consistent state — the next poll tick will skip the parts
 * that succeeded and retry the parts that didn't.
 */

export interface FoldArgs {
  mapId: bigint;
  characterId: bigint;
  fromSystemId: number;
  toSystemId: number;
}

export interface FoldResult {
  mapId: bigint;
  fromSystemAdded: boolean;
  toSystemAdded: boolean;
  connectionCreated: boolean;
}

export async function foldWormholeJumpOntoMap(args: FoldArgs): Promise<FoldResult> {
  const fromOutcome = await ensureSystemVisible(args.mapId, args.fromSystemId, args.characterId);
  const toOutcome = await ensureSystemVisible(args.mapId, args.toSystemId, args.characterId);
  const connectionCreated = await ensureConnection(
    args.mapId,
    fromOutcome.mapSystemId,
    toOutcome.mapSystemId,
    args.characterId,
  );
  return {
    mapId: args.mapId,
    fromSystemAdded: fromOutcome.emitted,
    toSystemAdded: toOutcome.emitted,
    connectionCreated,
  };
}

interface EnsureSystemOutcome {
  mapSystemId: bigint;
  emitted: boolean;
}

async function ensureSystemVisible(
  mapId: bigint,
  systemId: number,
  characterId: bigint,
): Promise<EnsureSystemOutcome> {
  const [existing] = await db
    .select({ id: apMapSystem.id, visible: apMapSystem.visible })
    .from(apMapSystem)
    .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.systemId, systemId)));
  if (existing?.visible) {
    return { mapSystemId: existing.id, emitted: false };
  }

  let mapSystemId: bigint | null = null;
  const result = await commitMapEvent({
    mapId,
    characterId,
    kind: 'system.added',
    mutate: async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(apMapSystem)
        .values({ mapId, systemId, visible: true })
        .onConflictDoUpdate({
          target: [apMapSystem.mapId, apMapSystem.systemId],
          // Preserve alias/tag/status/intel/position on a re-add.
          set: { visible: true, lastVisibleAt: now, updatedAt: now },
        })
        .returning({ id: apMapSystem.id });
      mapSystemId = row!.id;
      return buildSystemNode(tx, row!.id);
    },
  });
  if (!result.ok) throw new Error(`Failed to add system ${systemId} to map ${mapId}: ${result.error}`);
  if (mapSystemId === null) throw new Error('system.added returned without a map_system id');
  return { mapSystemId, emitted: true };
}

async function ensureConnection(
  mapId: bigint,
  sourceMapSystemId: bigint,
  targetMapSystemId: bigint,
  characterId: bigint,
): Promise<boolean> {
  // Reject self-loop early — the underlying table CHECK constraint would
  // throw, but rejecting here keeps the failure mode obvious in the logs.
  if (sourceMapSystemId === targetMapSystemId) return false;

  const existing = await db
    .select({ id: apMapConnection.id })
    .from(apMapConnection)
    .where(
      and(
        eq(apMapConnection.mapId, mapId),
        or(
          and(
            eq(apMapConnection.sourceMapSystemId, sourceMapSystemId),
            eq(apMapConnection.targetMapSystemId, targetMapSystemId),
          ),
          and(
            eq(apMapConnection.sourceMapSystemId, targetMapSystemId),
            eq(apMapConnection.targetMapSystemId, sourceMapSystemId),
          ),
        ),
      ),
    )
    .limit(1);
  if (existing.length > 0) return false;

  const result = await commitMapEvent({
    mapId,
    characterId,
    kind: 'connection.create',
    mutate: async (tx) => {
      const [row] = await tx
        .insert(apMapConnection)
        .values({
          mapId,
          sourceMapSystemId,
          targetMapSystemId,
          scope: 'wh',
          massStatus: 'fresh',
          jumpMassClass: null,
          isEol: false,
          isFrigate: false,
          preserveMass: false,
          isRolling: false,
          eolAt: null,
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .returning({
          id: apMapConnection.id,
          source: apMapConnection.sourceMapSystemId,
          target: apMapConnection.targetMapSystemId,
          scope: apMapConnection.scope,
          massStatus: apMapConnection.massStatus,
          jumpMassClass: apMapConnection.jumpMassClass,
          isEol: apMapConnection.isEol,
          isFrigate: apMapConnection.isFrigate,
          preserveMass: apMapConnection.preserveMass,
          isRolling: apMapConnection.isRolling,
        });
      return {
        id: row!.id.toString(),
        source: row!.source.toString(),
        target: row!.target.toString(),
        scope: row!.scope,
        massStatus: row!.massStatus,
        jumpMassClass: row!.jumpMassClass,
        isEol: row!.isEol,
        isFrigate: row!.isFrigate,
        preserveMass: row!.preserveMass,
        isRolling: row!.isRolling,
      };
    },
  });
  if (!result.ok) {
    throw new Error(
      `Failed to create wormhole connection on map ${mapId}: ${result.error}`,
    );
  }
  return true;
}
