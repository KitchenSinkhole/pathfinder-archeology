import 'server-only';
import { and, eq, type InferInsertModel } from 'drizzle-orm';
import { apMapSystem, systemStatus } from '@/db/schema';
import { buildSystemNode } from '../systemNode';
import { commitMapEvent, type ActionResult } from './core';
import type { MapEventPatch, MapEventPayload } from '@/lib/realtime/protocol';

/**
 * System-level map mutations. Each is exactly one `commitMapEvent` call (one
 * `ap_map_event` row → one realtime broadcast). Per the CLAUDE.md lifecycle
 * rule, systems are never hard-deleted: removal flips `visible = false` so prior
 * intel/tags/status survive a re-add.
 */

type SystemStatus = (typeof systemStatus.enumValues)[number];

export type AddSystemInput = {
  mapId: bigint;
  /** EVE solar-system id (`universe_system.id`). */
  systemId: number;
  characterId: bigint | null;
  positionX?: number;
  positionY?: number;
};

export type RemoveSystemInput = {
  mapId: bigint;
  /** `ap_map_system.id` (the xyflow node id). */
  mapSystemId: bigint;
  characterId: bigint | null;
};

/** Fields a client may change on a placed system. Omitted keys are left untouched. */
export type UpdateSystemPatch = {
  alias?: string | null;
  tag?: string | null;
  status?: SystemStatus;
  intelNotes?: string | null;
  locked?: boolean;
  /** Non-null sets a rally point; null clears it. */
  rallyAt?: Date | null;
  positionX?: number;
  positionY?: number;
};

export type UpdateSystemInput = {
  mapId: bigint;
  mapSystemId: bigint;
  characterId: bigint | null;
  patch: UpdateSystemPatch;
};

/**
 * Add a solar system to a map. Inserts a new visible row, or — reusing the
 * `(map_id, system_id)` unique row — flips a previously-removed one back to
 * `visible = true` while leaving its alias/tag/status/intel intact. Emits
 * `system.added` carrying the full node body the canvas needs to render it.
 */
export function addSystem(input: AddSystemInput): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'system.added',
    mutate: async (tx) => {
      const now = new Date();
      const reactivate: Partial<InferInsertModel<typeof apMapSystem>> = {
        visible: true,
        lastVisibleAt: now,
        updatedAt: now,
      };
      if (input.positionX !== undefined) reactivate.positionX = input.positionX;
      if (input.positionY !== undefined) reactivate.positionY = input.positionY;

      const [row] = await tx
        .insert(apMapSystem)
        .values({
          mapId: input.mapId,
          systemId: input.systemId,
          visible: true,
          positionX: input.positionX,
          positionY: input.positionY,
        })
        .onConflictDoUpdate({
          target: [apMapSystem.mapId, apMapSystem.systemId],
          set: reactivate,
        })
        .returning({ id: apMapSystem.id });

      return buildSystemNode(tx, row!.id);
    },
  });
}

/** Remove a system from a map: flip `visible = false` (the row persists). Emits `system.removed`. */
export function removeSystem(input: RemoveSystemInput): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'system.removed',
    mutate: async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(apMapSystem)
        .set({ visible: false, lastVisibleAt: now, updatedAt: now })
        .where(and(eq(apMapSystem.id, input.mapSystemId), eq(apMapSystem.mapId, input.mapId)))
        .returning({ id: apMapSystem.id });
      if (!row) throw new Error('System not found on map.');
      return { id: row.id.toString() };
    },
  });
}

/** Update a system's intel/position fields. Only the keys present in `patch` change. Emits `system.updated`. */
export function updateSystem(input: UpdateSystemInput): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'system.updated',
    mutate: async (tx) => {
      const { patch } = input;
      const set: Partial<InferInsertModel<typeof apMapSystem>> = { updatedAt: new Date() };
      if ('alias' in patch) set.alias = patch.alias;
      if ('tag' in patch) set.tag = patch.tag;
      if ('status' in patch) set.status = patch.status;
      if ('intelNotes' in patch) set.intelNotes = patch.intelNotes;
      if ('locked' in patch) set.locked = patch.locked;
      if ('rallyAt' in patch) set.rallyAt = patch.rallyAt;
      if ('positionX' in patch) set.positionX = patch.positionX;
      if ('positionY' in patch) set.positionY = patch.positionY;

      const [row] = await tx
        .update(apMapSystem)
        .set(set)
        .where(and(eq(apMapSystem.id, input.mapSystemId), eq(apMapSystem.mapId, input.mapId)))
        .returning({ id: apMapSystem.id });
      if (!row) throw new Error('System not found on map.');

      const out: MapEventPatch<'system.updated'> = { id: row.id.toString() };
      if ('alias' in patch) out.alias = patch.alias;
      if ('tag' in patch) out.tag = patch.tag;
      if ('status' in patch) out.status = patch.status;
      if ('intelNotes' in patch) out.intelNotes = patch.intelNotes;
      if ('locked' in patch) out.locked = patch.locked;
      if ('rallyAt' in patch) out.rallyAt = patch.rallyAt ? patch.rallyAt.toISOString() : null;
      if ('positionX' in patch) out.positionX = patch.positionX;
      if ('positionY' in patch) out.positionY = patch.positionY;
      return out;
    },
  });
}

// `buildSystemNode` moved to `../systemNode.ts` so the Stage 12.2 location-poll
// fold (`src/lib/jobs/locationCommit.ts`) can share the same payload builder
// without inheriting this file's `'server-only'` guard.
