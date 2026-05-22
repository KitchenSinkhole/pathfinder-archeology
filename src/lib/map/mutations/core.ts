import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMapEvent } from '@/db/schema';
import {
  mapEventPayloadSchema,
  type MapEventKind,
  type MapEventPatch,
  type MapEventPayload,
} from '@/lib/realtime/protocol';

/**
 * The single canonical commit point for every map mutation (CLAUDE.md "Mutation
 * pathways"). Each mutation lands as exactly ONE `INSERT INTO ap_map_event`; the
 * `tg_map_event_notify` trigger fan-outs the `payload` verbatim on
 * `map:<map_id>`, so the row write is the only side effect — no application-level
 * `pg_notify`, no dual-write to a parallel audit table.
 *
 * The new event id is pre-allocated from the table's sequence so it can be
 * embedded in the payload (as `eventId`) before the insert fires the trigger —
 * that's the dedupe key the initiating client uses to drop its own realtime echo.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Discriminated result for every mutation pathway (Server Action / API route). */
export type ActionResult<T> =
  | { ok: true; data: T; eventId: number }
  | { ok: false; error: string };

export type CommitMapEventArgs<K extends MapEventKind> = {
  mapId: bigint;
  /** Audit FK (`ap_map_event.character_id`); null when the actor was erased. */
  characterId: bigint | null;
  kind: K;
  /**
   * Runs inside the transaction. Performs the row write(s) and returns the patch
   * body for the event payload (everything except `kind`/`eventId`). The
   * pre-allocated `eventId` is passed in for helpers that need it in the patch.
   */
  mutate: (tx: Tx, eventId: number) => Promise<MapEventPatch<K>>;
};

/**
 * Open a transaction, run `mutate`, build `{ kind, eventId, ...patch }`, validate
 * it against `mapEventPayloadSchema`, and insert exactly one `ap_map_event`. An
 * invalid payload or a throwing `mutate` rolls the whole transaction back and
 * surfaces as `{ ok: false }` — no half-written event, no orphaned row.
 *
 * Returns the validated payload and its `eventId` on success.
 */
export async function commitMapEvent<K extends MapEventKind>(
  args: CommitMapEventArgs<K>,
): Promise<ActionResult<MapEventPayload>> {
  const { mapId, characterId, kind, mutate } = args;
  try {
    const result = await db.transaction(async (tx) => {
      const [seq] = (
        await tx.execute(
          sql`SELECT nextval(pg_get_serial_sequence('ap_map_event', 'id')) AS id`,
        )
      ).rows as Array<{ id: string }>;
      const eventId = Number(seq!.id);

      const patch = await mutate(tx, eventId);
      const payload = mapEventPayloadSchema.parse({ kind, eventId, ...patch });
      const occurredAt = new Date();

      await tx
        .insert(apMapEvent)
        .values({ id: BigInt(eventId), mapId, characterId, occurredAt, kind, payload })
        .returning({ id: apMapEvent.id });

      return { eventId, payload };
    });
    return { ok: true, data: result.payload, eventId: result.eventId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Mutation failed.' };
  }
}
