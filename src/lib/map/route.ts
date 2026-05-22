import 'server-only';
import { db } from '@/db/client';
import { universeStargateEdge } from '@/db/schema';
import { apertureConfig } from '../../../aperture.config';

/** Gate-jump distance from one system to a single trade hub. */
export type HubRoute = {
  /** Hub solar-system id. */
  systemId: number;
  name: string;
  /** Gate jumps to the hub, or `null` when no gate route exists (e.g. wormhole space). */
  jumps: number | null;
};

/**
 * Gate-jump distance from each given system to every configured trade hub
 * (`apertureConfig.ROUTE_HUBS`), computed by BFS over `universe_stargate_edge`.
 *
 * One BFS per hub across the whole gate graph yields distances to all systems at
 * once, so this is called once per page load for every system on the map rather
 * than per system-click. Systems with no gate edges (wormhole space) get `null`.
 *
 * Result is keyed by EVE solar-system id; hubs are in `ROUTE_HUBS` display order.
 */
export async function routesForSystems(
  systemIds: number[],
): Promise<Record<number, HubRoute[]>> {
  const result: Record<number, HubRoute[]> = {};
  if (systemIds.length === 0) return result;

  const adjacency = await loadGateGraph();

  // distancesByHub[hubSystemId] = Map<systemId, jumps>
  const distancesByHub = new Map<number, Map<number, number>>();
  for (const hub of apertureConfig.ROUTE_HUBS) {
    distancesByHub.set(hub.systemId, bfs(adjacency, hub.systemId));
  }

  for (const systemId of systemIds) {
    result[systemId] = apertureConfig.ROUTE_HUBS.map((hub) => {
      const dist = distancesByHub.get(hub.systemId)?.get(systemId);
      return { systemId: hub.systemId, name: hub.name, jumps: dist ?? null };
    });
  }
  return result;
}

/** Gate-jump distances from a single system to every configured hub. */
export async function jumpsToHubs(systemId: number): Promise<HubRoute[]> {
  const all = await routesForSystems([systemId]);
  return all[systemId] ?? [];
}

async function loadGateGraph(): Promise<Map<number, number[]>> {
  const edges = await db
    .select({ from: universeStargateEdge.fromSystemId, to: universeStargateEdge.toSystemId })
    .from(universeStargateEdge);
  const adjacency = new Map<number, number[]>();
  // Stargates are bidirectional; index both directions defensively in case the
  // SDE only lists one.
  for (const e of edges) {
    pushEdge(adjacency, e.from, e.to);
    pushEdge(adjacency, e.to, e.from);
  }
  return adjacency;
}

function pushEdge(adjacency: Map<number, number[]>, from: number, to: number): void {
  const list = adjacency.get(from);
  if (list) list.push(to);
  else adjacency.set(from, [to]);
}

function bfs(adjacency: Map<number, number[]>, source: number): Map<number, number> {
  const dist = new Map<number, number>([[source, 0]]);
  const queue: number[] = [source];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentDist = dist.get(current)!;
    for (const next of adjacency.get(current) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, currentDist + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}
