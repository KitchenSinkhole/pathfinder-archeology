import 'server-only';
import { and, eq, type InferInsertModel } from 'drizzle-orm';
import { apMapSignature, apMapSystem } from '@/db/schema';
import { commitMapEvent, type ActionResult } from './core';
import type { MapEventPatch, MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Signature-level map mutations, each a single `commitMapEvent` call.
 * Signatures are hard-deleted (no soft-delete lifecycle): when a sig is
 * removed from the in-game scanner it's gone. Sigs bound to a connection
 * cascade-delete when that connection collapses.
 *
 * `apMapSignature` has no direct `map_id` column — ownership is validated
 * through `apMapSystem.map_id` in update/delete so a client cannot reach a
 * signature on a different map via a forged id.
 */

export type CreateSignatureInput = {
  mapId: bigint;
  mapSystemId: bigint;
  mapConnectionId?: bigint | null;
  characterId: bigint | null;
  sigId: string;
  groupId?: number | null;
  typeId?: number | null;
  name?: string | null;
  description?: string | null;
  expiresAt: Date;
};

export type UpdateSignaturePatch = {
  mapConnectionId?: bigint | null;
  sigId?: string;
  groupId?: number | null;
  typeId?: number | null;
  name?: string | null;
  description?: string | null;
  expiresAt?: Date;
};

export type UpdateSignatureInput = {
  mapId: bigint;
  signatureId: bigint;
  characterId: bigint | null;
  patch: UpdateSignaturePatch;
};

export type DeleteSignatureInput = {
  mapId: bigint;
  signatureId: bigint;
  characterId: bigint | null;
};

/** Create a scan signature in a map system. Emits `signature.create` with the full body. */
export function createSignature(
  input: CreateSignatureInput,
): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'signature.create',
    mutate: async (tx) => {
      const [row] = await tx
        .insert(apMapSignature)
        .values({
          mapSystemId: input.mapSystemId,
          mapConnectionId: input.mapConnectionId ?? null,
          sigId: input.sigId,
          groupId: input.groupId ?? null,
          typeId: input.typeId ?? null,
          name: input.name ?? null,
          description: input.description ?? null,
          expiresAt: input.expiresAt,
        })
        .returning({
          id: apMapSignature.id,
          mapSystemId: apMapSignature.mapSystemId,
          mapConnectionId: apMapSignature.mapConnectionId,
          sigId: apMapSignature.sigId,
          groupId: apMapSignature.groupId,
          typeId: apMapSignature.typeId,
          name: apMapSignature.name,
          description: apMapSignature.description,
          expiresAt: apMapSignature.expiresAt,
        });
      return {
        id: row!.id.toString(),
        mapSystemId: row!.mapSystemId.toString(),
        mapConnectionId: row!.mapConnectionId?.toString() ?? null,
        sigId: row!.sigId,
        groupId: row!.groupId,
        typeId: row!.typeId,
        name: row!.name,
        description: row!.description,
        expiresAt: row!.expiresAt.toISOString(),
      };
    },
  });
}

/**
 * Update a signature's fields. Only keys present in `patch` change. Ownership
 * is validated: the signature's map_system must belong to `input.mapId`.
 * Emits `signature.update` with only the changed fields.
 */
export function updateSignature(
  input: UpdateSignatureInput,
): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'signature.update',
    mutate: async (tx) => {
      const { patch } = input;

      const [existing] = await tx
        .select({ mapSystemId: apMapSignature.mapSystemId })
        .from(apMapSignature)
        .where(eq(apMapSignature.id, input.signatureId));
      if (!existing) throw new Error('Signature not found.');

      const [sys] = await tx
        .select({ id: apMapSystem.id })
        .from(apMapSystem)
        .where(and(eq(apMapSystem.id, existing.mapSystemId), eq(apMapSystem.mapId, input.mapId)));
      if (!sys) throw new Error('Signature does not belong to this map.');

      const set: Partial<InferInsertModel<typeof apMapSignature>> = { updatedAt: new Date() };
      if ('mapConnectionId' in patch) set.mapConnectionId = patch.mapConnectionId;
      if ('sigId' in patch) set.sigId = patch.sigId;
      if ('groupId' in patch) set.groupId = patch.groupId;
      if ('typeId' in patch) set.typeId = patch.typeId;
      if ('name' in patch) set.name = patch.name;
      if ('description' in patch) set.description = patch.description;
      if ('expiresAt' in patch) set.expiresAt = patch.expiresAt;

      const [row] = await tx
        .update(apMapSignature)
        .set(set)
        .where(eq(apMapSignature.id, input.signatureId))
        .returning({ id: apMapSignature.id });
      if (!row) throw new Error('Signature not found.');

      const out: MapEventPatch<'signature.update'> = { id: row.id.toString() };
      if ('mapConnectionId' in patch)
        out.mapConnectionId = patch.mapConnectionId?.toString() ?? null;
      if ('sigId' in patch) out.sigId = patch.sigId;
      if ('groupId' in patch) out.groupId = patch.groupId;
      if ('typeId' in patch) out.typeId = patch.typeId;
      if ('name' in patch) out.name = patch.name;
      if ('description' in patch) out.description = patch.description;
      if ('expiresAt' in patch) out.expiresAt = patch.expiresAt!.toISOString();
      return out;
    },
  });
}

/**
 * Hard-delete a signature. Ownership validated through map_system.
 * Emits `signature.delete` → `{ id }`.
 */
export function deleteSignature(
  input: DeleteSignatureInput,
): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'signature.delete',
    mutate: async (tx) => {
      const [existing] = await tx
        .select({ mapSystemId: apMapSignature.mapSystemId })
        .from(apMapSignature)
        .where(eq(apMapSignature.id, input.signatureId));
      if (!existing) throw new Error('Signature not found.');

      const [sys] = await tx
        .select({ id: apMapSystem.id })
        .from(apMapSystem)
        .where(and(eq(apMapSystem.id, existing.mapSystemId), eq(apMapSystem.mapId, input.mapId)));
      if (!sys) throw new Error('Signature does not belong to this map.');

      const [row] = await tx
        .delete(apMapSignature)
        .where(eq(apMapSignature.id, input.signatureId))
        .returning({ id: apMapSignature.id });
      if (!row) throw new Error('Signature not found.');
      return { id: row.id.toString() };
    },
  });
}
