'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MapEventPayload, MapSystemNode, MapViewData } from '@/types';
import type { HubRoute } from '@/lib/map/route';
import type { SystemStatsSummary } from '@/lib/map/stats';
import { applyEvent } from '@/lib/map/applyEvent';
import {
  createConnectionOnServer,
  createSignatureOnServer,
  deleteConnectionOnServer,
  deleteSignatureOnServer,
  removeSystemOnServer,
  updateConnectionOnServer,
  updateSignatureOnServer,
  updateSystemOnServer,
  type CreateSignatureBody,
  type UpdateConnectionBody,
  type UpdateSignatureBody,
  type UpdateSystemBody,
} from '@/lib/map/client';
import { mapUpdateLoadSchema } from '@/lib/realtime/protocol';
import { useMapSubscription, useRealtime } from '@/lib/realtime/useRealtime';
import { RouteModule } from '@/components/sidebar/RouteModule';
import { KillStatsModule } from '@/components/sidebar/KillStatsModule';
import {
  InspectorModule,
  type SelectionRef,
} from '@/components/sidebar/InspectorModule';
import { ConnectionEdge, type ConnectionEdgeData } from './ConnectionEdge';
import { SystemNode, type SystemNodeData } from './SystemNode';

const nodeTypes = { system: SystemNode };
const edgeTypes = { connection: ConnectionEdge };

export function MapCanvas({
  data,
  routes,
  stats,
}: {
  data: MapViewData;
  routes: Record<number, HubRoute[]>;
  stats: Record<number, SystemStatsSummary>;
}) {
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  const [viewData, setViewData] = useState<MapViewData>(data);
  const appliedEventIds = useRef<Set<number>>(new Set());

  useMapSubscription(Number(data.map.id));
  const { lastEvent } = useRealtime();

  // ---- Realtime apply (with dedupe of our own optimistic echoes) ----------
  useEffect(() => {
    if (!lastEvent || lastEvent.task !== 'mapUpdate') return;
    const loadResult = mapUpdateLoadSchema.safeParse(lastEvent.load);
    if (!loadResult.success || !loadResult.data.data) return;
    const payload = loadResult.data.data;
    if (appliedEventIds.current.has(payload.eventId)) return;
    appliedEventIds.current.add(payload.eventId);
    setViewData((prev) => applyEvent(prev, payload));
  }, [lastEvent]);

  // ---- Optimistic-apply helpers (PATCH/DELETE) ---------------------------
  //
  // For PATCH/DELETE we apply locally first, snapshot for rollback, and dedupe
  // the realtime echo by its returned eventId. POST helpers (system add /
  // connection create / signature create) await the server payload and apply
  // through the normal path.
  const runOptimistic = useCallback(
    async (
      optimistic: MapEventPayload,
      run: () => Promise<{ ok: true; data: MapEventPayload; eventId: number } | { ok: false; error: string }>,
    ) => {
      let snapshot: MapViewData | null = null;
      setViewData((prev) => {
        snapshot = prev;
        return applyEvent(prev, optimistic);
      });
      const result = await run();
      if (result.ok) {
        appliedEventIds.current.add(result.eventId);
      } else if (snapshot) {
        setViewData(snapshot);
      }
    },
    [],
  );

  const awaitServer = useCallback(
    async (
      run: () => Promise<{ ok: true; data: MapEventPayload; eventId: number } | { ok: false; error: string }>,
    ) => {
      const result = await run();
      if (!result.ok) return;
      appliedEventIds.current.add(result.eventId);
      setViewData((prev) => applyEvent(prev, result.data));
    },
    [],
  );

  // ---- xyflow → server callbacks -----------------------------------------
  const mapId = viewData.map.id;

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent | unknown, node: Node) => {
      const existing = viewData.systems.find((s) => s.id === node.id);
      if (
        !existing ||
        (existing.positionX === node.position.x && existing.positionY === node.position.y)
      ) {
        return;
      }
      const patch: UpdateSystemBody = { positionX: node.position.x, positionY: node.position.y };
      runOptimistic(
        {
          kind: 'system.updated',
          eventId: 0,
          id: node.id,
          positionX: node.position.x,
          positionY: node.position.y,
        },
        () => updateSystemOnServer({ mapId, mapSystemId: node.id, patch }),
      );
    },
    [mapId, viewData.systems, runOptimistic],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;
      awaitServer(() =>
        createConnectionOnServer({
          mapId,
          body: {
            sourceMapSystemId: params.source!,
            targetMapSystemId: params.target!,
            scope: 'wh',
          },
        }),
      );
    },
    [mapId, awaitServer],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      if (selectedNodes[0]) setSelected({ kind: 'system', id: selectedNodes[0].id });
      else if (selectedEdges[0]) setSelected({ kind: 'connection', id: selectedEdges[0].id });
      else setSelected(null);
    },
    [],
  );

  // ---- Inspector callbacks -----------------------------------------------
  const onSystemPatch = useCallback(
    (mapSystemId: string, patch: UpdateSystemBody) => {
      const opt: MapEventPayload = { kind: 'system.updated', eventId: 0, id: mapSystemId, ...patch };
      runOptimistic(opt, () => updateSystemOnServer({ mapId, mapSystemId, patch }));
    },
    [mapId, runOptimistic],
  );

  const onSystemRemove = useCallback(
    (mapSystemId: string) => {
      runOptimistic(
        { kind: 'system.removed', eventId: 0, id: mapSystemId },
        () => removeSystemOnServer({ mapId, mapSystemId }),
      );
      setSelected(null);
    },
    [mapId, runOptimistic],
  );

  const onConnectionPatch = useCallback(
    (connectionId: string, patch: UpdateConnectionBody) => {
      const opt: MapEventPayload = {
        kind: 'connection.update',
        eventId: 0,
        id: connectionId,
        ...patch,
      };
      runOptimistic(opt, () => updateConnectionOnServer({ mapId, connectionId, patch }));
    },
    [mapId, runOptimistic],
  );

  const onConnectionDelete = useCallback(
    (connectionId: string) => {
      runOptimistic(
        { kind: 'connection.delete', eventId: 0, id: connectionId },
        () => deleteConnectionOnServer({ mapId, connectionId }),
      );
      setSelected(null);
    },
    [mapId, runOptimistic],
  );

  const onSignatureCreate = useCallback(
    (body: CreateSignatureBody) => {
      awaitServer(() => createSignatureOnServer({ mapId, body }));
    },
    [mapId, awaitServer],
  );

  const onSignaturePatch = useCallback(
    (signatureId: string, patch: UpdateSignatureBody) => {
      const opt: MapEventPayload = {
        kind: 'signature.update',
        eventId: 0,
        id: signatureId,
        ...patch,
      };
      runOptimistic(opt, () => updateSignatureOnServer({ mapId, signatureId, patch }));
    },
    [mapId, runOptimistic],
  );

  const onSignatureDelete = useCallback(
    (signatureId: string) => {
      runOptimistic(
        { kind: 'signature.delete', eventId: 0, id: signatureId },
        () => deleteSignatureOnServer({ mapId, signatureId }),
      );
    },
    [mapId, runOptimistic],
  );

  const onAliasOrTagCommit = useCallback(
    (mapSystemId: string, field: 'alias' | 'tag', next: string | null) => {
      onSystemPatch(mapSystemId, { [field]: next });
    },
    [onSystemPatch],
  );

  // ---- xyflow nodes/edges ------------------------------------------------
  const nodes = useMemo<Node<SystemNodeData>[]>(
    () =>
      viewData.systems.map((s) => ({
        id: s.id,
        type: 'system',
        position: { x: s.positionX, y: s.positionY },
        data: { ...s, onAliasOrTagCommit },
      })),
    [viewData.systems, onAliasOrTagCommit],
  );

  const edges = useMemo<Edge<ConnectionEdgeData>[]>(
    () =>
      viewData.connections.map((c) => ({
        id: c.id,
        type: 'connection',
        source: c.source,
        target: c.target,
        data: c,
      })),
    [viewData.connections],
  );

  const selectedSystem: MapSystemNode | null = useMemo(() => {
    if (selected?.kind !== 'system') return null;
    return viewData.systems.find((s) => s.id === selected.id) ?? null;
  }, [selected, viewData.systems]);

  return (
    <div className="flex gap-4">
      <div className="h-[72vh] flex-1 overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onSelectionChange={onSelectionChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          nodesDraggable
          nodesConnectable
          edgesFocusable
          colorMode="dark"
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <aside className="flex w-72 flex-col gap-4">
        <InspectorModule
          mapId={mapId}
          selected={selected}
          viewData={viewData}
          onSystemPatch={onSystemPatch}
          onSystemRemove={onSystemRemove}
          onConnectionPatch={onConnectionPatch}
          onConnectionDelete={onConnectionDelete}
          onSignatureCreate={onSignatureCreate}
          onSignaturePatch={onSignaturePatch}
          onSignatureDelete={onSignatureDelete}
        />
        <RouteModule
          system={selectedSystem}
          routes={selectedSystem ? routes[selectedSystem.systemId] : undefined}
        />
        <KillStatsModule
          system={selectedSystem}
          stats={selectedSystem ? stats[selectedSystem.systemId] : undefined}
        />
      </aside>
    </div>
  );
}
