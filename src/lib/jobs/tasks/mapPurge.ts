import { and, isNotNull, lt, sql } from 'drizzle-orm';
import { apertureConfig } from '../../../../aperture.config';
import { db } from '@/db/client';
import { apMap } from '@/db/schema';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 11.2. Daily map purge cron at EVE downtime: hard-delete `ap_map` rows
 * whose two-phase soft-delete window has elapsed
 * (`deleted_at < now() - MAP_PURGE_GRACE_DAYS`). `ON DELETE CASCADE` from
 * `ap_map.id` removes `ap_map_system`, `ap_map_connection`, `ap_map_signature`,
 * `ap_map_event`, and any per-map webhook config in one DDL operation.
 *
 * No `ap_map_event` is written and no `pg_notify` is fanned out — the map is
 * already soft-deleted, no client tabs are subscribed, and the cascade removes
 * the audit history along with everything else. This is the one Stage-11
 * housekeeping job that intentionally bypasses `commitMapEvent`.
 *
 * Replaces legacy `Cron\MapUpdate::deleteMapData` (`@downtime`). SPEC §6.5.
 */

const NAME = 'map-purge';

async function purge(): Promise<{ deleted: number }> {
  const rows = await db
    .delete(apMap)
    .where(
      and(
        isNotNull(apMap.deletedAt),
        lt(
          apMap.deletedAt,
          sql`now() - make_interval(days => ${apertureConfig.MAP_PURGE_GRACE_DAYS})`,
        ),
      ),
    )
    .returning({ id: apMap.id });

  return { deleted: rows.length };
}

export const mapPurge: JobModule = {
  name: NAME,
  cron: '0 11 * * *',
  run: withInstrumentation(NAME, purge),
};
