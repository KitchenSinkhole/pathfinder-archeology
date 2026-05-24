import { and, eq, isNull, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { apertureConfig } from '../../../../aperture.config';
import { db } from '@/db/client';
import { apCharacter, apMap, apMapCharacterTracking } from '@/db/schema';
import {
  esiCall,
  EsiBreakerOpenError,
  EsiDowntimeError,
  EsiTokenError,
} from '@/lib/esi/client';
import {
  characterOnlineSchema,
  characterShipSchema,
  locationSchema,
} from '@/lib/esi/decoders';
import { classifyJump, type JumpClass } from '@/lib/map/locationToConnection';
import { foldWormholeJumpOntoMap } from '../locationCommit';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Per-character location-poll. Scheduled via `addJob` only — no cron entry;
 * the *handler itself* re-enqueues the next tick with an adaptive delay (5s
 * online, 60s offline). The first enqueue happens via `startTrackingCharacter`
 * (`src/lib/jobs/tracking.ts`); from then on the loop is self-perpetuating
 * until either tracking rows are removed or the loop exits with a stop reason.
 *
 * Stage-by-stage scope:
 *   - 12.1: observe online state + location + ship, persist on `ap_character`.
 *   - 12.2: classify gate vs wormhole, fold wormhole jumps onto tracked maps
 *           as `system.added` / `connection.create` events.
 *   - 12.3: stop cleanly on token loss / status change, emit `characterUpdate`
 *           broadcasts so other tabs see the breadcrumb.
 *
 * Stop reasons (handler returns success=true with `notes.stopped` set; no
 * re-enqueue is scheduled):
 *   - `no-tracking`        — no `ap_map_character_tracking` rows for this id.
 *   - `character-missing`  — `ap_character` row gone (account erased).
 *   - `character-inactive` — status is `kicked` / `banned`.
 *   - `token-loss`         — `EsiTokenError` from any ESI call; tracking rows
 *                            for the character are deleted (a future
 *                            re-authenticate + `startTrackingCharacter` re-arms
 *                            the loop).
 */

const NAME = 'location-poll';

const LOCATION_POLL_JOB_KEY_PREFIX = 'location-poll:';

interface LocationPollPayload {
  characterId: string; // bigint stringified — JSON has no bigint
}

interface FoldSummary {
  mapId: string;
  fromSystemAdded: boolean;
  toSystemAdded: boolean;
  connectionCreated: boolean;
}

interface PollNotes {
  stopped?: 'no-tracking' | 'character-inactive' | 'character-missing' | 'token-loss';
  online?: boolean;
  previousSystemId?: number | null;
  currentSystemId?: number | null;
  reenqueuedInMs?: number;
  esiOutage?: 'breaker-open' | 'downtime';
  jumpClass?: JumpClass | null;
  folds?: FoldSummary[];
}

async function poll(payload: LocationPollPayload, helpers: JobHelpers): Promise<PollNotes> {
  const characterId = BigInt(payload.characterId);

  // Step 1 — bail early if the character isn't tracked anywhere. The
  // `ap_map_character_tracking_character_idx` index covers this query.
  const trackingProbe = await db.execute<{ has_row: boolean }>(
    sql`SELECT EXISTS (
          SELECT 1 FROM ap_map_character_tracking WHERE character_id = ${characterId}
        ) AS has_row`,
  );
  if (!trackingProbe.rows[0]?.has_row) {
    return { stopped: 'no-tracking' };
  }

  // Step 2 — load last-known state + status. Status gate keeps a kicked/banned
  // character from continuing to consume their token bucket; `lastShipTypeId`
  // and `lastLocationAt` are read so the offline-branch broadcast can carry
  // the breadcrumb even when the offline tick itself doesn't refresh location.
  const [character] = await db
    .select({
      status: apCharacter.status,
      lastSystemId: apCharacter.lastSystemId,
      lastShipTypeId: apCharacter.lastShipTypeId,
      lastLocationAt: apCharacter.lastLocationAt,
    })
    .from(apCharacter)
    .where(eq(apCharacter.id, characterId));
  if (!character) {
    return { stopped: 'character-missing' };
  }
  if (character.status !== 'active') {
    return { stopped: 'character-inactive' };
  }

  try {
    // Step 3 — online probe.
    const onlineProbe = await esiCall('getCharacterOnline', {
      schema: characterOnlineSchema,
      characterId,
    });

    // Step 4 — list the maps that should see this character's broadcast / fan-out.
    const trackedMapIds = await loadActiveTrackedMaps(characterId);

    // Step 5 — offline tick: stamp the flag, broadcast the breadcrumb on every
    // tracked map channel, push the next tick out to the slower cadence.
    if (!onlineProbe.online) {
      await db
        .update(apCharacter)
        .set({ lastOnline: false, updatedAt: sql`now()` })
        .where(eq(apCharacter.id, characterId));
      const reenqueuedInMs = apertureConfig.LOCATION_POLL_OFFLINE_MS;
      await reenqueue(helpers, payload, reenqueuedInMs);
      await broadcastCharacterUpdate({
        trackedMapIds,
        characterId,
        online: false,
        systemId: character.lastSystemId,
        shipTypeId: character.lastShipTypeId,
        locationAt: character.lastLocationAt,
      });
      return { online: false, previousSystemId: character.lastSystemId, reenqueuedInMs };
    }

    // Step 6 — online: pull location + ship in parallel, persist, re-enqueue
    // at the fast cadence.
    const [location, ship] = await Promise.all([
      esiCall('getCharacterLocation', { schema: locationSchema, characterId }),
      esiCall('getCharacterShip', { schema: characterShipSchema, characterId }),
    ]);
    const locationAt = new Date();
    await db
      .update(apCharacter)
      .set({
        lastSystemId: location.solar_system_id,
        lastShipTypeId: ship.ship_type_id,
        lastOnline: true,
        lastLocationAt: locationAt,
        updatedAt: locationAt,
      })
      .where(eq(apCharacter.id, characterId));

    const reenqueuedInMs = apertureConfig.LOCATION_POLL_ONLINE_MS;
    await reenqueue(helpers, payload, reenqueuedInMs);

    // Step 7 — classify + fan-out. First poll (`previousSystemId === null`)
    // and same-system ticks both short-circuit. Gate jumps are observed-only.
    let jumpClass: JumpClass | null = null;
    let folds: FoldSummary[] | undefined;
    if (
      character.lastSystemId !== null &&
      location.solar_system_id !== character.lastSystemId
    ) {
      jumpClass = await classifyJump({
        fromSystemId: character.lastSystemId,
        toSystemId: location.solar_system_id,
      });
      if (jumpClass === 'wormhole') {
        folds = [];
        for (const mapId of trackedMapIds) {
          const result = await foldWormholeJumpOntoMap({
            mapId,
            characterId,
            fromSystemId: character.lastSystemId,
            toSystemId: location.solar_system_id,
          });
          folds.push({
            mapId: mapId.toString(),
            fromSystemAdded: result.fromSystemAdded,
            toSystemAdded: result.toSystemAdded,
            connectionCreated: result.connectionCreated,
          });
        }
      }
    }

    // Step 8 — broadcast the breadcrumb to every tracked map channel. Goes
    // out *after* the fold so the client receives `system.added` /
    // `connection.create` first and the `characterUpdate` lands on a canvas
    // that already knows the new system.
    await broadcastCharacterUpdate({
      trackedMapIds,
      characterId,
      online: true,
      systemId: location.solar_system_id,
      shipTypeId: ship.ship_type_id,
      locationAt,
    });

    return {
      online: true,
      previousSystemId: character.lastSystemId,
      currentSystemId: location.solar_system_id,
      reenqueuedInMs,
      jumpClass,
      ...(folds ? { folds } : {}),
    };
  } catch (err) {
    if (err instanceof EsiTokenError) {
      // Token is unusable — stop polling this character. Tracking rows go away
      // so a future tick (e.g. if one is already enqueued) also exits cleanly
      // via the step-1 probe. Re-enabling tracking requires the user to
      // re-authenticate and call `startTrackingCharacter` again.
      await db
        .delete(apMapCharacterTracking)
        .where(eq(apMapCharacterTracking.characterId, characterId));
      return { stopped: 'token-loss' };
    }
    if (err instanceof EsiBreakerOpenError || err instanceof EsiDowntimeError) {
      // ESI is in trouble — back off to the offline cadence and let
      // withInstrumentation record the failure. The loop survives.
      await reenqueue(helpers, payload, apertureConfig.LOCATION_POLL_OFFLINE_MS);
      throw err;
    }
    throw err;
  }
}

async function loadActiveTrackedMaps(characterId: bigint): Promise<bigint[]> {
  const rows = await db
    .select({ mapId: apMap.id })
    .from(apMapCharacterTracking)
    .innerJoin(apMap, eq(apMap.id, apMapCharacterTracking.mapId))
    .where(
      and(eq(apMapCharacterTracking.characterId, characterId), isNull(apMap.deletedAt)),
    );
  return rows.map((r) => r.mapId);
}

interface BroadcastArgs {
  trackedMapIds: bigint[];
  characterId: bigint;
  online: boolean;
  systemId: number | null;
  shipTypeId: number | null;
  locationAt: Date | null;
}

async function broadcastCharacterUpdate(args: BroadcastArgs): Promise<void> {
  if (args.trackedMapIds.length === 0) return;
  // The bus discriminates by the top-level `task` field — see `src/lib/realtime/bus.ts`.
  const envelope = JSON.stringify({
    task: 'characterUpdate',
    load: {
      characterId: Number(args.characterId),
      online: args.online,
      systemId: args.systemId,
      shipTypeId: args.shipTypeId,
      locationAt: args.locationAt ? args.locationAt.toISOString() : null,
    },
  });
  for (const mapId of args.trackedMapIds) {
    const channel = `${apertureConfig.MAP_EVENT_NOTIFY_CHANNEL_PREFIX}${mapId.toString()}`;
    await db.execute(sql`SELECT pg_notify(${channel}, ${envelope})`);
  }
}

async function reenqueue(
  helpers: JobHelpers,
  payload: LocationPollPayload,
  delayMs: number,
): Promise<void> {
  await helpers.addJob(NAME, payload, {
    runAt: new Date(Date.now() + delayMs),
    jobKey: locationPollJobKey(payload.characterId),
    jobKeyMode: 'replace',
  });
}

/** Stable job key per character — keeps at most one in-flight + one pending poll per character. */
export function locationPollJobKey(characterId: bigint | string): string {
  return `${LOCATION_POLL_JOB_KEY_PREFIX}${characterId}`;
}

export const locationPoll: JobModule = {
  name: NAME,
  // No cron — scheduled via `addJob` only. `startTrackingCharacter` enqueues
  // the first tick; the handler re-enqueues itself thereafter.
  run: withInstrumentation(NAME, poll),
};
