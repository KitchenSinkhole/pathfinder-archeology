import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  apCharacter,
  apStructure,
  universeCategory,
  universeGroup,
  universeType,
} from '@/db/schema';
import type { ApStructure } from '@/types';

/** A structure-intel row shaped for the sidebar (ids as strings, type name resolved). */
export type StructureIntel = {
  id: string;
  systemId: number;
  name: string;
  structureTypeId: number;
  typeName: string;
  ownerName: string | null;
  notes: string | null;
  /** `ap_character.name` of the creator — light at-a-glance accountability. Null if erased. */
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

/** An Upwell structure type for the create/edit picker. */
export type UpwellStructureType = { typeId: number; name: string; groupName: string };

/**
 * Structure intel for the given universe systems, keyed by `system_id`. One
 * batched query joins `universe_type` for the type name and `ap_character` for
 * the creator name. Systems with no structures are absent from the record.
 *
 * NOTE: structure intel has no realtime channel (it is deployment-global, not
 * map-scoped — see `ap_structure`). This snapshot is load-time only: a structure
 * another user adds appears here on the next page load, not live.
 */
export async function structuresForSystems(
  systemIds: number[],
): Promise<Record<number, StructureIntel[]>> {
  if (systemIds.length === 0) return {};
  const rows = await db
    .select({
      id: apStructure.id,
      systemId: apStructure.systemId,
      name: apStructure.name,
      structureTypeId: apStructure.structureTypeId,
      typeName: universeType.name,
      ownerName: apStructure.ownerName,
      notes: apStructure.notes,
      createdByName: apCharacter.name,
      createdAt: apStructure.createdAt,
      updatedAt: apStructure.updatedAt,
    })
    .from(apStructure)
    .innerJoin(universeType, eq(apStructure.structureTypeId, universeType.id))
    .leftJoin(apCharacter, eq(apStructure.createdByCharacterId, apCharacter.id))
    .where(inArray(apStructure.systemId, systemIds))
    .orderBy(asc(apStructure.systemId), asc(apStructure.name));

  const out: Record<number, StructureIntel[]> = {};
  for (const r of rows) {
    (out[r.systemId] ??= []).push({
      id: r.id.toString(),
      systemId: r.systemId,
      name: r.name,
      structureTypeId: r.structureTypeId,
      typeName: r.typeName,
      ownerName: r.ownerName,
      notes: r.notes,
      createdByName: r.createdByName,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    });
  }
  return out;
}

/**
 * The placeable Upwell structure types (Astrahus, Fortizar, Keepstar, Raitaru,
 * Azbel, Sotiyo, Athanor, Tatara, Ansiblex, …), ordered by name, for the
 * create/edit picker. Filters by the `'Structure'` category *name* rather than a
 * hard-coded id so it survives an SDE re-ingest.
 */
export async function upwellStructureTypes(): Promise<UpwellStructureType[]> {
  const rows = await db
    .select({
      typeId: universeType.id,
      name: universeType.name,
      groupName: universeGroup.name,
    })
    .from(universeType)
    .innerJoin(universeGroup, eq(universeType.groupId, universeGroup.id))
    .innerJoin(universeCategory, eq(universeGroup.categoryId, universeCategory.id))
    .where(and(eq(universeCategory.name, 'Structure'), eq(universeType.published, true)))
    .orderBy(asc(universeType.name));
  return rows;
}

/**
 * Shape a freshly written `ap_structure` row into a `StructureIntel` for the
 * client, resolving `typeName` and `createdByName`. Used by the create/update
 * routes so the client always receives a complete row to splice into local state.
 */
export async function withTypeName(row: ApStructure): Promise<StructureIntel> {
  const [typeRow] = await db
    .select({ name: universeType.name })
    .from(universeType)
    .where(eq(universeType.id, row.structureTypeId));
  let createdByName: string | null = null;
  if (row.createdByCharacterId !== null) {
    const [charRow] = await db
      .select({ name: apCharacter.name })
      .from(apCharacter)
      .where(eq(apCharacter.id, row.createdByCharacterId));
    createdByName = charRow?.name ?? null;
  }
  return {
    id: row.id.toString(),
    systemId: row.systemId,
    name: row.name,
    structureTypeId: row.structureTypeId,
    typeName: typeRow?.name ?? '',
    ownerName: row.ownerName,
    notes: row.notes,
    createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
