import { and, eq, isNull, lt, not, sql } from 'drizzle-orm';
import { apertureConfig } from '../../../../aperture.config';
import { db } from '@/db/client';
import { apMap, apMapConnection } from '@/db/schema';
import { commitMapEvent } from '@/lib/map/mutations/core';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 11.2. EOL-expiry cron: delete `ap_map_connection` rows that have been
 * flagged end-of-life (`is_eol = true`) for longer than
 * `EOL_CONNECTION_EXPIRY_SECONDS` (4h 15m, legacy `EXPIRE_CONNECTIONS_EOL`), but
 * only on maps where `ap_map.delete_eol_connections = true`. Each delete fires
 * through `commitMapEvent` so it becomes a `connection.delete` event on the
 * realtime bus.
 *
 * Connections are hard-deleted (CLAUDE.md: wormholes don't come back); attached
 * `ap_map_signature` rows cascade.
 *
 * Replaces legacy `Cron\MapUpdate::deleteEolConnections` (`@fiveMinutes`).
 * SPEC §6.5.
 */

const NAME = 'eol-expiry';

async function expireEol(): Promise<{ scanned: number; deleted: number; failed: number }> {
  const candidates = await db
    .select({
      connectionId: apMapConnection.id,
      mapId: apMapConnection.mapId,
    })
    .from(apMapConnection)
    .innerJoin(apMap, eq(apMapConnection.mapId, apMap.id))
    .where(
      and(
        eq(apMapConnection.isEol, true),
        // eol_at is null until isEol flips; skip races where isEol=true but no stamp yet.
        not(isNull(apMapConnection.eolAt)),
        lt(
          apMapConnection.eolAt,
          sql`now() - make_interval(secs => ${apertureConfig.EOL_CONNECTION_EXPIRY_SECONDS})`,
        ),
        eq(apMap.deleteEolConnections, true),
        isNull(apMap.deletedAt),
      ),
    )
    .limit(apertureConfig.JOB_DELETE_BATCH_SIZE);

  let deleted = 0;
  let failed = 0;
  for (const row of candidates) {
    const result = await commitMapEvent({
      mapId: row.mapId,
      characterId: null,
      kind: 'connection.delete',
      mutate: async (tx) => {
        const [del] = await tx
          .delete(apMapConnection)
          .where(eq(apMapConnection.id, row.connectionId))
          .returning({ id: apMapConnection.id });
        if (!del) throw new Error('Connection already gone.');
        return { id: del.id.toString() };
      },
    });
    if (result.ok) deleted += 1;
    else failed += 1;
  }

  return { scanned: candidates.length, deleted, failed };
}

export const eolExpiry: JobModule = {
  name: NAME,
  cron: '*/5 * * * *',
  run: withInstrumentation(NAME, expireEol),
};
