import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { apertureConfig } from '../../../../aperture.config';
import { db } from '@/db/client';
import { apMap, apMapSignature, apMapSystem } from '@/db/schema';
import { commitMapEvent } from '@/lib/map/mutations/core';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 11.2. Signature-reap cron: delete `ap_map_signature` rows whose
 * `expires_at` is in the past, on maps that are not soft-deleted. Each delete
 * fires through `commitMapEvent` so the row removal becomes a `signature.delete`
 * event — client tabs apply the disappearance the same way they handle a
 * user-initiated delete.
 *
 * Bounded by `JOB_DELETE_BATCH_SIZE` per run; any leftovers are picked up on
 * the next tick. Per-row transactions: one bad row never poisons the rest.
 *
 * Replaces legacy `Cron\MapUpdate::deleteSignatures` (`@halfHour`). SPEC §6.5.
 */

const NAME = 'signature-reap';

async function reap(): Promise<{ scanned: number; deleted: number; failed: number }> {
  const candidates = await db
    .select({
      signatureId: apMapSignature.id,
      mapId: apMapSystem.mapId,
    })
    .from(apMapSignature)
    .innerJoin(apMapSystem, eq(apMapSignature.mapSystemId, apMapSystem.id))
    .innerJoin(apMap, eq(apMapSystem.mapId, apMap.id))
    .where(and(lt(apMapSignature.expiresAt, sql`now()`), isNull(apMap.deletedAt)))
    .limit(apertureConfig.JOB_DELETE_BATCH_SIZE);

  let deleted = 0;
  let failed = 0;
  for (const row of candidates) {
    const result = await commitMapEvent({
      mapId: row.mapId,
      characterId: null,
      kind: 'signature.delete',
      mutate: async (tx) => {
        const [del] = await tx
          .delete(apMapSignature)
          .where(eq(apMapSignature.id, row.signatureId))
          .returning({ id: apMapSignature.id });
        if (!del) throw new Error('Signature already gone.');
        return { id: del.id.toString() };
      },
    });
    if (result.ok) deleted += 1;
    else failed += 1;
  }

  return { scanned: candidates.length, deleted, failed };
}

export const signatureReap: JobModule = {
  name: NAME,
  cron: '*/30 * * * *',
  run: withInstrumentation(NAME, reap),
};
