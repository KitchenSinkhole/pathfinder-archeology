'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { apMap } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
  adminVisibilityScope,
  isAdmin,
  isManagerOrAdmin,
  mapScopeFilterFor,
  type AdminVisibilityScope,
} from '@/lib/auth/rights';
import { commitMapEvent, type ActionResult } from '@/lib/map/mutations/core';
import type { MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Stage 16.2 admin map actions. Three operations, each gated independently of
 * the corp-right matrix because the admin panel is the manager/admin's
 * override path:
 *
 *   - `adminSoftDeleteMap`  manager or admin, map within scope → sets `deleted_at`.
 *   - `adminRestoreMap`     manager or admin, map within scope → clears `deleted_at`.
 *   - `adminPurgeMap`       admin only,       map within scope → hard-deletes
 *                           (skips the 30-day `map-purge` cron grace).
 *
 * Scope rules (see `mapScopeFilterFor`): admin → any map; manager → maps where
 * `owner_corporation_id = actor.corporation_id` OR `owner_alliance_id = actor.alliance_id`
 * OR `owner_character_id` belongs to a corp member. The check runs in SQL via
 * `selectScopedMap` to keep the rule consistent with the admin maps listing.
 */

const mapIdSchema = z.string().regex(/^\d+$/, 'Invalid map id.');

type MapRow = {
  id: bigint;
  deletedAt: Date | null;
};

async function selectScopedMap(
  id: bigint,
  scope: AdminVisibilityScope,
): Promise<MapRow | null> {
  const [row] = await db
    .select({ id: apMap.id, deletedAt: apMap.deletedAt })
    .from(apMap)
    .where(and(eq(apMap.id, id), mapScopeFilterFor(scope)));
  return row ?? null;
}

/**
 * Stage 16.2. Soft-delete a map: set `deleted_at = now()`. Mirrors the user
 * `deleteMapAction` outcome (same event kind, same payload shape) but bypasses
 * the corp-right matrix in favour of an admin/manager gate. The 30-day
 * `map-purge` cron remains the eventual hard-delete path.
 */
export async function adminSoftDeleteMap(
  mapId: string,
): Promise<ActionResult<MapEventPayload>> {
  const parsed = mapIdSchema.safeParse(mapId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const session = await auth();
  if (!(await isManagerOrAdmin(session))) {
    return { ok: false, error: 'Forbidden.' };
  }
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Forbidden.' };
  const id = BigInt(parsed.data);
  const target = await selectScopedMap(id, scope);
  if (target === null) return { ok: false, error: 'Map not found.' };
  if (target.deletedAt !== null) return { ok: false, error: 'Map is already soft-deleted.' };

  const characterId = session!.characterId ? BigInt(session!.characterId) : null;
  const result = await commitMapEvent({
    mapId: id,
    characterId,
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

  if (result.ok) {
    revalidatePath('/admin/maps');
    revalidatePath('/maps');
  }
  return result;
}

/**
 * Stage 16.2. Restore a soft-deleted map by clearing `deleted_at`. Emits
 * `map.restore` so the audit chain records the action. Manager or admin.
 */
export async function adminRestoreMap(
  mapId: string,
): Promise<ActionResult<MapEventPayload>> {
  const parsed = mapIdSchema.safeParse(mapId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const session = await auth();
  if (!(await isManagerOrAdmin(session))) {
    return { ok: false, error: 'Forbidden.' };
  }
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Forbidden.' };
  const id = BigInt(parsed.data);
  const target = await selectScopedMap(id, scope);
  if (target === null) return { ok: false, error: 'Map not found.' };
  if (target.deletedAt === null) return { ok: false, error: 'Map is not soft-deleted.' };

  const characterId = session!.characterId ? BigInt(session!.characterId) : null;
  const result = await commitMapEvent({
    mapId: id,
    characterId,
    kind: 'map.restore',
    mutate: async (tx) => {
      const [row] = await tx
        .update(apMap)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(apMap.id, id), isNotNull(apMap.deletedAt)))
        .returning({ id: apMap.id });
      if (!row) throw new Error('Map is not soft-deleted.');
      return { id: row.id.toString() };
    },
  });

  if (result.ok) {
    revalidatePath('/admin/maps');
    revalidatePath('/maps');
  }
  return result;
}

/**
 * Stage 16.2. Admin-only: hard-delete a soft-deleted map immediately, skipping
 * the 30-day `map-purge` cron grace. Managers cannot invoke (they may
 * soft-delete but not purge).
 *
 * Transaction ordering matters: the `map.purge` event INSERTs first so the
 * `tg_map_event_notify` trigger queues the `pg_notify('map:<id>', payload)`.
 * The subsequent `ap_map` DELETE cascades through `ap_map_event` (incl. the
 * row we just inserted) and every other per-map child table. Postgres buffers
 * notifications until COMMIT, so subscribers still receive the purge envelope
 * even though the source row is gone. The `commitMapEvent({ tx })` joined-tx
 * mode skips its post-commit webhook enqueue, which is correct — no map to
 * dispatch about post-commit.
 */
export async function adminPurgeMap(
  mapId: string,
): Promise<ActionResult<MapEventPayload>> {
  const parsed = mapIdSchema.safeParse(mapId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const session = await auth();
  if (!(await isAdmin(session))) {
    return { ok: false, error: 'Admin required.' };
  }
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Forbidden.' };
  const id = BigInt(parsed.data);
  const target = await selectScopedMap(id, scope);
  if (target === null) return { ok: false, error: 'Map not found.' };
  if (target.deletedAt === null) {
    return { ok: false, error: 'Map must be soft-deleted before purging.' };
  }

  const characterId = session!.characterId ? BigInt(session!.characterId) : null;
  try {
    const eventId = await db.transaction(async (tx) => {
      const inner = await commitMapEvent({
        tx,
        mapId: id,
        characterId,
        kind: 'map.purge',
        mutate: async () => ({ id: id.toString() }),
      });
      if (!inner.ok) throw new Error(inner.error);
      const result = await tx
        .delete(apMap)
        .where(eq(apMap.id, id))
        .returning({ id: apMap.id });
      if (result.length === 0) throw new Error('Map vanished mid-purge.');
      return inner.eventId;
    });
    revalidatePath('/admin/maps');
    return {
      ok: true,
      data: { kind: 'map.purge', eventId, id: id.toString() },
      eventId,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Purge failed.' };
  }
}

