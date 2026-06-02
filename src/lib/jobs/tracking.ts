import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apCharacter, apMap, apMapCharacterTracking, apMapTrackingSeed } from '@/db/schema';
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
  console.log(`Starting tracking for character ${args.characterId} on map ${args.mapId}…`);
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
          json_build_object('characterId', ${args.characterId.toString()}::text)::json,
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

/**
 * Remove the character from tracking on **every** map. Used when a user
 * disables tracking for a character from the Characters panel (Stage 17.5
 * follow-up). Like `stopTrackingCharacter`, this doesn't cancel the in-flight
 * poll — the next handler tick sees no tracking rows (and the disabled flag)
 * and exits cleanly.
 */
export async function stopAllTrackingForCharacter(characterId: bigint): Promise<void> {
  await db
    .delete(apMapCharacterTracking)
    .where(eq(apMapCharacterTracking.characterId, characterId));
}

/**
 * Point each character's tracking at exactly `mapId` — the account's last-open
 * map (Stage 17.5 follow-up). Called when a tab subscribes to a map: every
 * enabled character on the account starts (or keeps) folding onto the viewed
 * map, and is removed from any *other* map it was tracking, so a character
 * tracks a single map at a time and switching maps moves tracking with it.
 *
 * Each character's upsert + other-map purge runs in one transaction; the poll
 * is then (re-)enqueued with `preserve_run_at` so an already-running loop keeps
 * its cadence. The caller is responsible for the map being viewable/live — this
 * is the realtime-subscribe seam, downstream of `canViewMap`.
 */
export interface SeedTrackingArgs {
  mapId: bigint;
  userId: number;
}

/**
 * The per-map default: the first time an account opens a map, track all its
 * active characters (per-map-character-tracking plan, Stage 1). Idempotent and
 * gated by the `ap_map_tracking_seed` marker so the auto-add fires exactly once
 * per `(map, account)` — after that the user's explicit per-map selection
 * stands, *including selecting zero* (an empty selection is no longer mistaken
 * for a fresh map).
 *
 * In one transaction: `INSERT … ON CONFLICT DO NOTHING` the seed marker; if the
 * marker was freshly inserted, select the account's `active` characters and
 * upsert a `(mapId, characterId)` tracking row for each, then enqueue each
 * character's poll with `preserve_run_at` (an already-running loop keeps its
 * cadence). When the marker already exists this is a no-op — the join table is
 * left exactly as the user configured it.
 *
 * The caller is responsible for the map being viewable/live (this is the
 * realtime-subscribe seam, downstream of `canViewMap`).
 */
export async function seedTrackingForMap(args: SeedTrackingArgs): Promise<void> {
  await db.transaction(async (tx) => {
    const marker = await tx
      .insert(apMapTrackingSeed)
      .values({ mapId: args.mapId, userId: args.userId })
      .onConflictDoNothing()
      .returning({ mapId: apMapTrackingSeed.mapId });
    // Marker already existed → this account has configured this map before.
    // Leave the selection untouched (including an intentional empty set).
    if (marker.length === 0) return;

    const characters = await tx
      .select({ id: apCharacter.id })
      .from(apCharacter)
      .where(and(eq(apCharacter.userId, args.userId), eq(apCharacter.status, 'active')));

    for (const { id: characterId } of characters) {
      await tx
        .insert(apMapCharacterTracking)
        .values({ mapId: args.mapId, characterId })
        .onConflictDoNothing();
      await tx.execute(
        sql`SELECT graphile_worker.add_job(
              'location-poll',
              json_build_object('characterId', ${characterId.toString()}::text)::json,
              job_key => ${locationPollJobKey(characterId)},
              job_key_mode => 'preserve_run_at',
              run_at => now()
            )`,
      );
    }
  });
}

export async function trackCharactersOnMap(
  characterIds: bigint[],
  mapId: bigint,
): Promise<void> {
  if (characterIds.length === 0) return;
  await db.transaction(async (tx) => {
    for (const characterId of characterIds) {
      await tx
        .insert(apMapCharacterTracking)
        .values({ mapId, characterId })
        .onConflictDoNothing();
      await tx
        .delete(apMapCharacterTracking)
        .where(
          and(
            eq(apMapCharacterTracking.characterId, characterId),
            ne(apMapCharacterTracking.mapId, mapId),
          ),
        );
      await tx.execute(
        sql`SELECT graphile_worker.add_job(
              'location-poll',
              json_build_object('characterId', ${characterId.toString()}::text)::json,
              job_key => ${locationPollJobKey(characterId)},
              job_key_mode => 'preserve_run_at',
              run_at => now()
            )`,
      );
    }
  });
}
