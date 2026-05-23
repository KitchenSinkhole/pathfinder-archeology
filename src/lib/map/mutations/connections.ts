import 'server-only';
import { and, eq, type InferInsertModel } from 'drizzle-orm';
import { apMapConnection, connectionScope, whJumpMass, whMass } from '@/db/schema';
import { commitMapEvent, type ActionResult } from './core';
import type { MapEventPatch, MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Connection-level map mutations (create / delete / update), each a single
 * `commitMapEvent` call. Unlike systems, connections are HARD-deleted on
 * collapse (CLAUDE.md: wormholes don't come back; attached signatures cascade).
 */

type ConnectionScope = (typeof connectionScope.enumValues)[number];
type WhMass = (typeof whMass.enumValues)[number];
type WhJumpMass = (typeof whJumpMass.enumValues)[number];

export type CreateConnectionInput = {
  mapId: bigint;
  characterId: bigint | null;
  sourceMapSystemId: bigint;
  targetMapSystemId: bigint;
  scope: ConnectionScope;
  massStatus?: WhMass;
  jumpMassClass?: WhJumpMass | null;
  isEol?: boolean;
  isFrigate?: boolean;
  preserveMass?: boolean;
  isRolling?: boolean;
};

export type DeleteConnectionInput = {
  mapId: bigint;
  connectionId: bigint;
  characterId: bigint | null;
};

/** Fields a client may change on a connection. Omitted keys are left untouched. */
export type UpdateConnectionPatch = {
  scope?: ConnectionScope;
  massStatus?: WhMass;
  jumpMassClass?: WhJumpMass | null;
  isEol?: boolean;
  isFrigate?: boolean;
  preserveMass?: boolean;
  isRolling?: boolean;
};

export type UpdateConnectionInput = {
  mapId: bigint;
  connectionId: bigint;
  characterId: bigint | null;
  patch: UpdateConnectionPatch;
};

/** Create a connection between two map systems. Emits `connection.create` with the full edge body. */
export function createConnection(
  input: CreateConnectionInput,
): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'connection.create',
    mutate: async (tx) => {
      const isEol = input.isEol ?? false;
      const [row] = await tx
        .insert(apMapConnection)
        .values({
          mapId: input.mapId,
          sourceMapSystemId: input.sourceMapSystemId,
          targetMapSystemId: input.targetMapSystemId,
          scope: input.scope,
          massStatus: input.massStatus ?? 'fresh',
          jumpMassClass: input.jumpMassClass ?? null,
          isEol,
          isFrigate: input.isFrigate ?? false,
          preserveMass: input.preserveMass ?? false,
          isRolling: input.isRolling ?? false,
          eolAt: isEol ? new Date() : null,
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
          eolAt: apMapConnection.eolAt,
          createdAt: apMapConnection.createdAt,
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
        eolAt: row!.eolAt ? row!.eolAt.toISOString() : null,
        createdAt: row!.createdAt.toISOString(),
      };
    },
  });
}

/** Hard-delete a connection (wormholes don't come back). Attached signatures cascade. Emits `connection.delete` → `{ id }`. */
export function deleteConnection(
  input: DeleteConnectionInput,
): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'connection.delete',
    mutate: async (tx) => {
      const [row] = await tx
        .delete(apMapConnection)
        .where(
          and(eq(apMapConnection.id, input.connectionId), eq(apMapConnection.mapId, input.mapId)),
        )
        .returning({ id: apMapConnection.id });
      if (!row) throw new Error('Connection not found on map.');
      return { id: row.id.toString() };
    },
  });
}

/**
 * Update a connection's flags. Only keys present in `patch` change. Toggling
 * `isEol` true stamps `eol_at` to *now* the first time it goes EOL (preserving
 * the original timestamp on a repeat true), and clears it to null when set
 * false — this `eol_at` feeds the EOL-expiry cron. Emits `connection.update`.
 */
export function updateConnection(
  input: UpdateConnectionInput,
): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'connection.update',
    mutate: async (tx) => {
      const { patch } = input;
      const set: Partial<InferInsertModel<typeof apMapConnection>> = { updatedAt: new Date() };
      if ('scope' in patch) set.scope = patch.scope;
      if ('massStatus' in patch) set.massStatus = patch.massStatus;
      if ('jumpMassClass' in patch) set.jumpMassClass = patch.jumpMassClass;
      if ('isFrigate' in patch) set.isFrigate = patch.isFrigate;
      if ('preserveMass' in patch) set.preserveMass = patch.preserveMass;
      if ('isRolling' in patch) set.isRolling = patch.isRolling;

      let nextEolAt: Date | null | undefined;
      if ('isEol' in patch) {
        set.isEol = patch.isEol;
        if (patch.isEol) {
          const [cur] = await tx
            .select({ eolAt: apMapConnection.eolAt })
            .from(apMapConnection)
            .where(
              and(
                eq(apMapConnection.id, input.connectionId),
                eq(apMapConnection.mapId, input.mapId),
              ),
            );
          nextEolAt = cur?.eolAt ?? new Date();
        } else {
          nextEolAt = null;
        }
        set.eolAt = nextEolAt;
      }

      const [row] = await tx
        .update(apMapConnection)
        .set(set)
        .where(
          and(eq(apMapConnection.id, input.connectionId), eq(apMapConnection.mapId, input.mapId)),
        )
        .returning({ id: apMapConnection.id });
      if (!row) throw new Error('Connection not found on map.');

      const out: MapEventPatch<'connection.update'> = { id: row.id.toString() };
      if ('scope' in patch) out.scope = patch.scope;
      if ('massStatus' in patch) out.massStatus = patch.massStatus;
      if ('jumpMassClass' in patch) out.jumpMassClass = patch.jumpMassClass;
      if ('isFrigate' in patch) out.isFrigate = patch.isFrigate;
      if ('preserveMass' in patch) out.preserveMass = patch.preserveMass;
      if ('isRolling' in patch) out.isRolling = patch.isRolling;
      if ('isEol' in patch) {
        out.isEol = patch.isEol;
        out.eolAt = nextEolAt ? nextEolAt.toISOString() : null;
      }
      return out;
    },
  });
}
