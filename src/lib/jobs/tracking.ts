import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMap, apMapCharacterTracking } from '@/db/schema';
import { locationPollJobKey } from './tasks/locationPoll';

/**
 * Stage 12.1 lifecycle seam for the per-character location-poll.
 *
 * Tracking enable/disable is a low-frequency operation (a user toggles it in
 * the map UI); it doesn't justify a long-lived `WorkerUtils` connection. We
 * enqueue via the SQL helper `graphile_worker.add_job` directly so this module
 * stays import-light and works from inside any request context (Server Action,
 * API route, future admin tool).
 *
 * The job key (`locationPollJobKey(characterId)`) is shared with the handler
 * itself — at most one in-flight + one pending poll exists per character.
 */

export interface StartTrackingArgs {
  mapId: bigint;
  characterId: bigint;
}

export type StartTrackingResult =
  | { ok: true; alreadyTracked: boolean }
  | { ok: false; error: 'map-missing' | 'map-soft-deleted' };

/**
 * Insert the (map, character) tracking row (idempotent — no-op if already
 * tracked) and enqueue the first `location-poll` for the character if one
 * isn't already scheduled. Returns `alreadyTracked: true` when the tracking
 * row already existed for this (map, character) pair.
 *
 * The handler is the one that decides what to do on its first tick (read
 * online state, persist, re-enqueue) — this function only fires the gun.
 */
export async function startTrackingCharacter(
  args: StartTrackingArgs,
): Promise<StartTrackingResult> {
  // Validate the map is live before persisting the subscription. A tracking
  // row pointing at a soft-deleted map would be harmless (the handler joins
  // through `WHERE deleted_at IS NULL`), but the failure mode of "I clicked
  // the toggle and nothing happened" is worse than a clean error here.
  const [map] = await db
    .select({ id: apMap.id, deletedAt: apMap.deletedAt })
    .from(apMap)
    .where(eq(apMap.id, args.mapId));
  if (!map) return { ok: false, error: 'map-missing' };
  if (map.deletedAt) return { ok: false, error: 'map-soft-deleted' };

  const inserted = await db
    .insert(apMapCharacterTracking)
    .values({ mapId: args.mapId, characterId: args.characterId })
    .onConflictDoNothing()
    .returning({ mapId: apMapCharacterTracking.mapId });
  const alreadyTracked = inserted.length === 0;

  // `preserve_run_at`: if a poll is already scheduled (from a prior `start`
  // call on a different map), keep its existing runAt — don't reset the clock.
  // If no job exists for this key, this acts as a normal insert with runAt = now().
  await db.execute(
    sql`SELECT graphile_worker.add_job(
          'location-poll',
          json_build_object('characterId', ${args.characterId.toString()})::json,
          job_key => ${locationPollJobKey(args.characterId)},
          job_key_mode => 'preserve_run_at',
          run_at => now()
        )`,
  );

  return { ok: true, alreadyTracked };
}

export interface StopTrackingArgs {
  mapId: bigint;
  characterId: bigint;
}

/**
 * Delete the (map, character) tracking row. Returns whether a row was removed.
 *
 * Does **not** cancel the in-flight poll job. The handler's first action is to
 * check whether any tracking rows still exist for the character; on the next
 * tick after the last row goes away, the handler exits with
 * `{ stopped: 'no-tracking' }` and never re-enqueues. This avoids a race
 * between an in-flight handler reading the database and an external cancel.
 */
export async function stopTrackingCharacter(args: StopTrackingArgs): Promise<{ removed: boolean }> {
  const deleted = await db
    .delete(apMapCharacterTracking)
    .where(
      and(
        eq(apMapCharacterTracking.mapId, args.mapId),
        eq(apMapCharacterTracking.characterId, args.characterId),
      ),
    )
    .returning({ mapId: apMapCharacterTracking.mapId });
  return { removed: deleted.length > 0 };
}
