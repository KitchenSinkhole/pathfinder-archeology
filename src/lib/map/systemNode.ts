import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  apMapSystem,
  universeConstellation,
  universeRegion,
  universeSystem,
  universeSystemStatic,
  universeWormhole,
} from '@/db/schema';
import type { MapEventPatch } from '@/lib/realtime/protocol';

// No `import 'server-only'`: pure read-side helper, consumed by both the
// user-driven mutation wrappers (`src/lib/map/mutations/systems.ts`, which DOES
// carry the guard) and by Stage 12.2 job code (`src/lib/jobs/locationCommit.ts`)
// that runs under plain Node and would crash on the `server-only/index.js`
// throw. Same precedent as Stage 11.2's `commitMapEvent` extraction.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Re-read a placed system flattened with its universe metadata + statics — the
 * full `system.added` event body the canvas needs to render the node without a
 * follow-up fetch. Used inside a `commitMapEvent` `mutate` callback (so the
 * inserted row is visible) and shaped to match `mapEventPayloadSchema`.
 */
export async function buildSystemNode(
  tx: Tx,
  mapSystemId: bigint,
): Promise<MapEventPatch<'system.added'>> {
  const [row] = await tx
    .select({
      id: apMapSystem.id,
      systemId: apMapSystem.systemId,
      alias: apMapSystem.alias,
      tag: apMapSystem.tag,
      status: apMapSystem.status,
      locked: apMapSystem.locked,
      positionX: apMapSystem.positionX,
      positionY: apMapSystem.positionY,
      name: universeSystem.name,
      security: universeSystem.security,
      trueSec: universeSystem.trueSec,
      effect: universeSystem.effect,
      constellationName: universeConstellation.name,
      regionName: universeRegion.name,
    })
    .from(apMapSystem)
    .innerJoin(universeSystem, eq(apMapSystem.systemId, universeSystem.id))
    .innerJoin(universeConstellation, eq(universeSystem.constellationId, universeConstellation.id))
    .innerJoin(universeRegion, eq(universeConstellation.regionId, universeRegion.id))
    .where(eq(apMapSystem.id, mapSystemId));
  if (!row) throw new Error('System row vanished mid-transaction.');

  const staticRows = await tx
    .select({ code: universeWormhole.name })
    .from(universeSystemStatic)
    .innerJoin(universeWormhole, eq(universeSystemStatic.typeId, universeWormhole.typeId))
    .where(eq(universeSystemStatic.systemId, row.systemId));

  return {
    id: row.id.toString(),
    systemId: row.systemId,
    name: row.name,
    alias: row.alias,
    tag: row.tag,
    status: row.status,
    security: row.security,
    trueSec: row.trueSec,
    effect: row.effect,
    regionName: row.regionName,
    constellationName: row.constellationName,
    statics: staticRows.map((s) => s.code),
    locked: row.locked,
    positionX: row.positionX,
    positionY: row.positionY,
  };
}
