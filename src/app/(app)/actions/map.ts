'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { apMap, mapScope, mapType } from '@/db/schema';
import { requireSession } from '@/lib/session';
import type { InferInsertModel } from 'drizzle-orm';
import { commitMapEvent, type ActionResult } from '@/lib/map/mutations/core';
import type { MapEventPatch, MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Low-frequency, user-initiated map mutations via Server Actions (CLAUDE.md
 * mutation pathways: Server Actions for state changes where a fresh render is
 * the natural next step). Each one validates input, lands exactly one
 * `ap_map_event` through `commitMapEvent`, and revalidates the maps list.
 *
 * INTERIM ACCESS: mirrors Stage 7 — any logged-in character may mutate any
 * non-soft-deleted map. The real per-map rights model lands in Stage 15.
 */

const createMapSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100),
  scope: z.enum(mapScope.enumValues),
  type: z.enum(mapType.enumValues),
  icon: z.string().trim().max(100).nullish(),
});

const updateMapSettingsSchema = z.object({
  mapId: z.string().regex(/^\d+$/, 'Invalid map id.'),
  name: z.string().trim().min(1).max(100).optional(),
  icon: z.string().trim().max(100).nullish(),
  deleteExpiredConnections: z.boolean().optional(),
  deleteEolConnections: z.boolean().optional(),
  trackAbyssalJumps: z.boolean().optional(),
  logActivity: z.boolean().optional(),
});

export type CreateMapInput = z.input<typeof createMapSchema>;
export type UpdateMapSettingsInput = z.input<typeof updateMapSettingsSchema>;

/** Create a map. Emits `map.create`; the new map id is in `data.id`. */
export async function createMapAction(
  input: CreateMapInput,
): Promise<ActionResult<MapEventPayload>> {
  const session = await requireSession();
  const parsed = createMapSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const { name, scope, type, icon } = parsed.data;

  // The map id is needed both as the event's `map_id` FK and in the payload, so
  // pre-allocate it from the sequence before the row is inserted (mirrors the
  // `eventId` pre-allocation in commitMapEvent). Sequences are non-transactional.
  const [seq] = (
    await db.execute(sql`SELECT nextval(pg_get_serial_sequence('ap_map', 'id')) AS id`)
  ).rows as Array<{ id: string }>;
  const mapId = BigInt(seq!.id);

  const result = await commitMapEvent({
    mapId,
    characterId: BigInt(session.characterId),
    kind: 'map.create',
    mutate: async (tx) => {
      await tx.insert(apMap).values({ id: mapId, name, scope, type, icon: icon ?? null });
      return { id: mapId.toString(), name, scope, type, icon: icon ?? null };
    },
  });

  if (result.ok) revalidatePath('/maps');
  return result;
}

/** Soft-delete a map (two-phase: set `deleted_at`, cron purges later). Emits `map.delete`. */
export async function deleteMapAction(mapId: string): Promise<ActionResult<MapEventPayload>> {
  const session = await requireSession();
  if (!/^\d+$/.test(mapId)) return { ok: false, error: 'Invalid map id.' };
  const id = BigInt(mapId);

  const result = await commitMapEvent({
    mapId: id,
    characterId: BigInt(session.characterId),
    kind: 'map.delete',
    mutate: async (tx) => {
      const deletedAt = new Date();
      const [row] = await tx
        .update(apMap)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(apMap.id, id), isNull(apMap.deletedAt)))
        .returning({ id: apMap.id });
      if (!row) throw new Error('Map not found or already deleted.');
      return { id: row.id.toString(), deletedAt: deletedAt.toISOString() };
    },
  });

  if (result.ok) revalidatePath('/maps');
  return result;
}

/** Update a map's name / icon / behavior flags. Emits `map.update` with only the changed fields. */
export async function updateMapSettingsAction(
  input: UpdateMapSettingsInput,
): Promise<ActionResult<MapEventPayload>> {
  const session = await requireSession();
  const parsed = updateMapSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const { mapId, ...patch } = parsed.data;
  const id = BigInt(mapId);

  const result = await commitMapEvent({
    mapId: id,
    characterId: BigInt(session.characterId),
    kind: 'map.update',
    mutate: async (tx) => {
      const set: Partial<InferInsertModel<typeof apMap>> = { updatedAt: new Date() };
      const out: MapEventPatch<'map.update'> = { id: id.toString() };
      if ('name' in patch) set.name = out.name = patch.name;
      if ('icon' in patch) set.icon = out.icon = patch.icon ?? null;
      if ('deleteExpiredConnections' in patch)
        set.deleteExpiredConnections = out.deleteExpiredConnections = patch.deleteExpiredConnections;
      if ('deleteEolConnections' in patch)
        set.deleteEolConnections = out.deleteEolConnections = patch.deleteEolConnections;
      if ('trackAbyssalJumps' in patch)
        set.trackAbyssalJumps = out.trackAbyssalJumps = patch.trackAbyssalJumps;
      if ('logActivity' in patch) set.logActivity = out.logActivity = patch.logActivity;

      const [row] = await tx
        .update(apMap)
        .set(set)
        .where(and(eq(apMap.id, id), isNull(apMap.deletedAt)))
        .returning({ id: apMap.id });
      if (!row) throw new Error('Map not found or deleted.');
      return out;
    },
  });

  if (result.ok) revalidatePath('/maps');
  return result;
}
