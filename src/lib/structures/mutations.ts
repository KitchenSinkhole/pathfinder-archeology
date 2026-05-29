import 'server-only';
import { eq, type InferInsertModel } from 'drizzle-orm';
import { db } from '@/db/client';
import { apStructure, apStructureEvent } from '@/db/schema';
import type { ApStructure } from '@/types';

/**
 * Structure-intel mutations. Structures are deployment-global manual intel with
 * no `map_id`, so they do NOT go through `commitMapEvent` / `ap_map_event` and
 * emit no realtime event — they are a plain REST resource.
 *
 * Every mutation writes the `ap_structure` row AND one `ap_structure_event`
 * audit row in the same transaction, stamped with the acting character, so that
 * — since any authenticated user may edit any structure — griefers remain
 * identifiable. Deletes are hard deletes; the audit row carries the full
 * pre-delete snapshot so the intel stays recoverable.
 */

export type CreateStructureInput = {
  systemId: number;
  name: string;
  structureTypeId: number;
  ownerName?: string | null;
  notes?: string | null;
  characterId: bigint | null;
};

export type UpdateStructurePatch = {
  name?: string;
  structureTypeId?: number;
  ownerName?: string | null;
  notes?: string | null;
};

export type UpdateStructureInput = {
  structureId: bigint;
  patch: UpdateStructurePatch;
  characterId: bigint | null;
};

export type DeleteStructureInput = {
  structureId: bigint;
  characterId: bigint | null;
};

/** Plain JSON snapshot of a structure row for the audit `payload` (no bigints/Dates). */
function snapshot(row: ApStructure) {
  return {
    id: row.id.toString(),
    systemId: row.systemId,
    name: row.name,
    structureTypeId: row.structureTypeId,
    ownerName: row.ownerName,
    notes: row.notes,
    createdByCharacterId: row.createdByCharacterId?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Insert a structure + a `create` audit event. Returns the new row. */
export function createStructure(input: CreateStructureInput): Promise<ApStructure> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(apStructure)
      .values({
        systemId: input.systemId,
        name: input.name,
        structureTypeId: input.structureTypeId,
        ownerName: input.ownerName ?? null,
        notes: input.notes ?? null,
        createdByCharacterId: input.characterId,
      })
      .returning();
    await tx.insert(apStructureEvent).values({
      structureId: row!.id,
      systemId: row!.systemId,
      characterId: input.characterId,
      kind: 'create',
      payload: snapshot(row!),
    });
    return row!;
  });
}

/**
 * Patch a structure (only present keys change; `updated_at` always bumps) + an
 * `update` audit event carrying the patch. Returns the updated row, or null if
 * the id does not exist (no event written).
 */
export function updateStructure(input: UpdateStructureInput): Promise<ApStructure | null> {
  return db.transaction(async (tx) => {
    const { patch } = input;
    const set: Partial<InferInsertModel<typeof apStructure>> = { updatedAt: new Date() };
    if ('name' in patch) set.name = patch.name;
    if ('structureTypeId' in patch) set.structureTypeId = patch.structureTypeId;
    if ('ownerName' in patch) set.ownerName = patch.ownerName;
    if ('notes' in patch) set.notes = patch.notes;

    const [row] = await tx
      .update(apStructure)
      .set(set)
      .where(eq(apStructure.id, input.structureId))
      .returning();
    if (!row) return null;

    await tx.insert(apStructureEvent).values({
      structureId: row.id,
      systemId: row.systemId,
      characterId: input.characterId,
      kind: 'update',
      payload: patch,
    });
    return row;
  });
}

/**
 * Hard-delete a structure + a `delete` audit event holding the full pre-delete
 * snapshot. Returns the deleted row, or null if the id did not exist.
 */
export function deleteStructure(input: DeleteStructureInput): Promise<ApStructure | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(apStructure)
      .where(eq(apStructure.id, input.structureId))
      .returning();
    if (!row) return null;

    await tx.insert(apStructureEvent).values({
      structureId: row.id,
      systemId: row.systemId,
      characterId: input.characterId,
      kind: 'delete',
      payload: snapshot(row),
    });
    return row;
  });
}
