import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  apMap,
  apMapConnection,
  apMapSignature,
  apMapSystem,
  connectionScope,
  mapScope,
  mapType,
  systemStatus,
  universeConstellation,
  universeRegion,
  universeSystem,
  universeSystemStatic,
  universeWormhole,
  whJumpMass,
  whMass,
} from '@/db/schema';

type SystemStatus = (typeof systemStatus.enumValues)[number];
type ConnectionScope = (typeof connectionScope.enumValues)[number];
type WhMass = (typeof whMass.enumValues)[number];
type WhJumpMass = (typeof whJumpMass.enumValues)[number];
type MapScope = (typeof mapScope.enumValues)[number];
type MapType = (typeof mapType.enumValues)[number];

/** A visible system on a map, flattened with its `universe_system` metadata. */
export type MapSystemNode = {
  /** `ap_map_system.id`, as a string (xyflow node id). */
  id: string;
  /** EVE solar-system id (`universe_system.id`). */
  systemId: number;
  name: string;
  alias: string | null;
  tag: string | null;
  status: SystemStatus;
  security: string | null;
  trueSec: number | null;
  effect: string | null;
  regionName: string;
  constellationName: string;
  /** Wormhole static codes (e.g. `["C247", "N062"]`); empty for k-space. */
  statics: string[];
  locked: boolean;
  positionX: number;
  positionY: number;
};

/** A connection between two systems on a map. Endpoints are `ap_map_system.id`s. */
export type MapConnectionEdge = {
  id: string;
  source: string;
  target: string;
  scope: ConnectionScope;
  massStatus: WhMass;
  jumpMassClass: WhJumpMass | null;
  isEol: boolean;
  isFrigate: boolean;
  preserveMass: boolean;
  isRolling: boolean;
};

/** A scan signature inside a placed system. Mirrors the realtime `signature.*` payload body. */
export type MapSignature = {
  /** `ap_map_signature.id` as a string. */
  id: string;
  /** `ap_map_system.id` the sig is in. */
  mapSystemId: string;
  /** `ap_map_connection.id` once the sig resolves to a wormhole, else null. */
  mapConnectionId: string | null;
  /** In-game 3-char scan id, e.g. "ABC". */
  sigId: string;
  groupId: number | null;
  typeId: number | null;
  name: string | null;
  description: string | null;
  /** ISO timestamp; `Date` serialised over the Server→Client boundary. */
  expiresAt: string;
};

/** Everything the read-only map page needs to render one map. */
export type MapViewData = {
  map: { id: string; name: string; scope: MapScope; type: MapType };
  systems: MapSystemNode[];
  connections: MapConnectionEdge[];
  signatures: MapSignature[];
};

/** A map row for the maps list. */
export type MapListItem = {
  id: string;
  name: string;
  scope: MapScope;
  type: MapType;
  icon: string | null;
};

/**
 * Load one map for the read-only view. Returns `null` when the map does not
 * exist or is soft-deleted (`deleted_at` set).
 *
 * INTERIM ACCESS: there is no per-map access model yet (Stage 15). Any logged-in
 * character may view any non-soft-deleted map. Real right-checks land in Stage 15.
 */
export async function loadMapForView(mapId: bigint): Promise<MapViewData | null> {
  const [map] = await db
    .select({ id: apMap.id, name: apMap.name, scope: apMap.scope, type: apMap.type })
    .from(apMap)
    .where(and(eq(apMap.id, mapId), isNull(apMap.deletedAt)));
  if (!map) return null;

  const systemRows = await db
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
    .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.visible, true)))
    .orderBy(apMapSystem.id);

  const staticsBySystem = await loadStatics(systemRows.map((s) => s.systemId));

  const connectionRows = await db
    .select({
      id: apMapConnection.id,
      source: apMapConnection.sourceMapSystemId,
      target: apMapConnection.targetMapSystemId,
      scope: apMapConnection.scope,
      massStatus: apMapConnection.massStatus,
      jumpMassClass: apMapConnection.jumpMassClass,
      isEol: apMapConnection.isEol,
      isFrigate: apMapConnection.isFrigate,
      preserveMass: apMapConnection.preserveMass,
      isRolling: apMapConnection.isRolling,
    })
    .from(apMapConnection)
    .where(eq(apMapConnection.mapId, mapId))
    .orderBy(apMapConnection.id);

  const visibleSystemIds = systemRows.map((s) => s.id);
  const signatureRows = visibleSystemIds.length
    ? await db
        .select({
          id: apMapSignature.id,
          mapSystemId: apMapSignature.mapSystemId,
          mapConnectionId: apMapSignature.mapConnectionId,
          sigId: apMapSignature.sigId,
          groupId: apMapSignature.groupId,
          typeId: apMapSignature.typeId,
          name: apMapSignature.name,
          description: apMapSignature.description,
          expiresAt: apMapSignature.expiresAt,
        })
        .from(apMapSignature)
        .where(inArray(apMapSignature.mapSystemId, visibleSystemIds))
        .orderBy(apMapSignature.sigId)
    : [];

  return {
    map: { id: map.id.toString(), name: map.name, scope: map.scope, type: map.type },
    systems: systemRows.map((s) => ({
      id: s.id.toString(),
      systemId: s.systemId,
      name: s.name,
      alias: s.alias,
      tag: s.tag,
      status: s.status,
      security: s.security,
      trueSec: s.trueSec,
      effect: s.effect,
      regionName: s.regionName,
      constellationName: s.constellationName,
      statics: staticsBySystem.get(s.systemId) ?? [],
      locked: s.locked,
      positionX: s.positionX,
      positionY: s.positionY,
    })),
    connections: connectionRows.map((c) => ({
      id: c.id.toString(),
      source: c.source.toString(),
      target: c.target.toString(),
      scope: c.scope,
      massStatus: c.massStatus,
      jumpMassClass: c.jumpMassClass,
      isEol: c.isEol,
      isFrigate: c.isFrigate,
      preserveMass: c.preserveMass,
      isRolling: c.isRolling,
    })),
    signatures: signatureRows.map((r) => ({
      id: r.id.toString(),
      mapSystemId: r.mapSystemId.toString(),
      mapConnectionId: r.mapConnectionId ? r.mapConnectionId.toString() : null,
      sigId: r.sigId,
      groupId: r.groupId,
      typeId: r.typeId,
      name: r.name,
      description: r.description,
      expiresAt: r.expiresAt.toISOString(),
    })),
  };
}

/** All non-soft-deleted maps, ordered by name. Feeds the maps list. */
export async function listViewableMaps(): Promise<MapListItem[]> {
  const rows = await db
    .select({
      id: apMap.id,
      name: apMap.name,
      scope: apMap.scope,
      type: apMap.type,
      icon: apMap.icon,
    })
    .from(apMap)
    .where(isNull(apMap.deletedAt))
    .orderBy(apMap.name);
  return rows.map((r) => ({ ...r, id: r.id.toString() }));
}

async function loadStatics(systemIds: number[]): Promise<Map<number, string[]>> {
  const grouped = new Map<number, string[]>();
  if (systemIds.length === 0) return grouped;
  const rows = await db
    .select({ systemId: universeSystemStatic.systemId, code: universeWormhole.name })
    .from(universeSystemStatic)
    .innerJoin(universeWormhole, eq(universeSystemStatic.typeId, universeWormhole.typeId))
    .where(inArray(universeSystemStatic.systemId, systemIds));
  for (const r of rows) {
    const list = grouped.get(r.systemId);
    if (list) list.push(r.code);
    else grouped.set(r.systemId, [r.code]);
  }
  return grouped;
}
