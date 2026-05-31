// Stage 17.10. The db-aware seam between the map mutation pathways and the pure
// tagging strategies. Builds a `TagContext` from the live map state, dispatches
// to the strategy resolved from the registry, and (for the add path) writes the
// assigned tag. No `import 'server-only'`: `locationCommit.ts` imports this under
// plain Node — same precedent as `systemNode.ts` / `core.ts`.

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMap, apMapConnection, apMapSystem, universeSystem } from '@/db/schema';
import { TAG_STRATEGIES } from './registry';
import type { ActiveScheme, TagContext } from './types';
import type { Tx } from '@/lib/map/mutations/core';

/** Either the request-scoped pool handle or an open transaction — both expose the query builder. */
type Executor = Tx | typeof db;

/**
 * Read one map's tagging scheme + Home, and — when a scheme is active — its
 * visible systems (with WH class) and connections. Returns null when the map
 * runs `tag_scheme = 'none'` (the caller then skips all tagging work).
 */
export async function loadTagContext(exec: Executor, mapId: bigint): Promise<TagContext | null> {
  const [map] = await exec
    .select({ scheme: apMap.tagScheme, homeMapSystemId: apMap.homeMapSystemId })
    .from(apMap)
    .where(eq(apMap.id, mapId));
  if (!map || map.scheme === 'none') return null;

  const systems = await exec
    .select({
      mapSystemId: apMapSystem.id,
      systemId: apMapSystem.systemId,
      tag: apMapSystem.tag,
      securityClass: universeSystem.security,
    })
    .from(apMapSystem)
    .innerJoin(universeSystem, eq(apMapSystem.systemId, universeSystem.id))
    .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.visible, true)));

  const connections = await exec
    .select({ source: apMapConnection.sourceMapSystemId, target: apMapConnection.targetMapSystemId })
    .from(apMapConnection)
    .where(eq(apMapConnection.mapId, mapId));

  return { scheme: map.scheme as ActiveScheme, homeMapSystemId: map.homeMapSystemId, systems, connections };
}

/**
 * Assign (or clear) a freshly-added system's tag inside the add transaction, so
 * the tag lands in the `system.added` payload. No-op when the map runs no scheme.
 * Writes the strategy's verdict verbatim — including `null`, which clears a tag
 * preserved by the `(map_id, system_id)` upsert on a re-add so reclaim stays
 * consistent (0121 re-tags later on reconnect; ABC recomputes here). The subject's
 * own current tag is excluded from the computation so a re-added system can
 * reclaim its old slot rather than skip past it.
 */
export async function assignTagOnAdd(tx: Tx, mapId: bigint, mapSystemId: bigint): Promise<void> {
  const ctx = await loadTagContext(tx, mapId);
  if (!ctx) return;
  const subject = ctx.systems.find((s) => s.mapSystemId === mapSystemId);
  if (!subject) return;

  const ctxForAssign: TagContext = {
    ...ctx,
    systems: ctx.systems.map((s) => (s.mapSystemId === mapSystemId ? { ...s, tag: null } : s)),
  };
  const tag = TAG_STRATEGIES[ctx.scheme].tagOnAdd(ctxForAssign, { ...subject, tag: null });

  await tx.update(apMapSystem).set({ tag }).where(eq(apMapSystem.id, mapSystemId));
}

/**
 * Compute the tag a just-connected untagged system should receive (0121), or
 * null. Read-only — the caller emits the `system.updated` event that writes it,
 * keeping "one mutation = one event". Returns null for ABC and for maps with no
 * scheme.
 */
export async function assignTagOnConnect(
  mapId: bigint,
  sourceMapSystemId: bigint,
  targetMapSystemId: bigint,
): Promise<{ mapSystemId: bigint; tag: string } | null> {
  const ctx = await loadTagContext(db, mapId);
  if (!ctx) return null;
  const source = ctx.systems.find((s) => s.mapSystemId === sourceMapSystemId);
  const target = ctx.systems.find((s) => s.mapSystemId === targetMapSystemId);
  if (!source || !target) return null;
  return TAG_STRATEGIES[ctx.scheme].tagOnConnect(ctx, { source, target });
}
