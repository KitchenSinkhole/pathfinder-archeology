'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MapEventPayload, MapSystemNode, MapViewData } from '@/types';
import type { HubRoute } from '@/lib/map/route';
import type { SystemStatsSummary } from '@/lib/map/stats';
import type { SystemIntelSummary } from '@/lib/map/intel';
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
import { IntelModule } from '@/components/sidebar/IntelModule';
import {
  InspectorModule,
  type SelectionRef,
} from '@/components/sidebar/InspectorModule';
import { SignatureModule } from '@/components/sidebar/SignatureModule';
import { ConnectionEdge, type ConnectionEdgeData } from './ConnectionEdge';
import { MapPresenceProvider } from './MapPresenceContext';
import { SystemNode, type SystemNodeData } from './SystemNode';

const nodeTypes = { system: SystemNode };
const edgeTypes = { connection: ConnectionEdge };

export function MapCanvas({
  data,
  routes,
  stats,
  intel,
}: {
  data: MapViewData;
  routes: Record<number, HubRoute[]>;
  stats: Record<number, SystemStatsSummary>;
  intel: Record<number, SystemIntelSummary>;
}) {
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  const [viewData, setViewData] = useState<MapViewData>(data);
  const [nodes, setNodes] = useState<Node<SystemNodeData>[]>(() =>
    data.systems.map((s) => ({
      id: s.id,
      type: 'system' as const,
      position: { x: s.positionX, y: s.positionY },
      data: s,
      selected: false,
    })),
  );
  const appliedEventIds = useRef<Set<number>>(new Set());

  const [initialViewport] = useState<Viewport | null>(() => {
    try {
      const raw = localStorage.getItem(`aperture:map:${data.map.id}:viewport`);
      return raw ? (JSON.parse(raw) as Viewport) : null;
    } catch {
      return null;
    }
  });

  const [canvasHeight, setCanvasHeight] = useState(600);

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

  const onNodesChange = useCallback((changes: NodeChange<Node<SystemNodeData>>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

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

  // Selection is driven by direct click handlers rather than xyflow's
  // `onSelectionChange`. In controlled mode without `onNodesChange`, xyflow's
  // internal selection mutation never produces a store `set()`, so
  // `onSelectionChange` only fires as a side effect of unrelated re-renders
  // (e.g. drag) — which made selecting via a still click take two attempts.
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelected({ kind: 'system', id: node.id });
  }, []);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelected({ kind: 'connection', id: edge.id });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelected(null);
  }, []);

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

  // Bulk paste returns N event payloads in commit order. Apply each and
  // register its eventId in the dedupe set — same contract `awaitServer`
  // uses for single-event mutations, just looped.
  const onBulkPaste = useCallback((payloads: MapEventPayload[]) => {
    if (payloads.length === 0) return;
    for (const p of payloads) appliedEventIds.current.add(p.eventId);
    setViewData((prev) => payloads.reduce(applyEvent, prev));
  }, []);

  const onMoveEnd = useCallback(
    (_: MouseEvent | TouchEvent | null, vp: Viewport) => {
      localStorage.setItem(`aperture:map:${mapId}:viewport`, JSON.stringify(vp));
    },
    [mapId],
  );

  // Restore canvas height after mount — localStorage unavailable during SSR.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('aperture:map:canvas-height');
      setCanvasHeight(raw ? parseInt(raw, 10) : Math.round(window.innerHeight * 0.7));
    } catch { /* ignore */ }
  }, []);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = canvasHeight;

      const onMouseMove = (ev: MouseEvent) => {
        setCanvasHeight(Math.max(200, startHeight + (ev.clientY - startY)));
      };

      const onMouseUp = (ev: MouseEvent) => {
        const h = Math.max(200, startHeight + (ev.clientY - startY));
        localStorage.setItem('aperture:map:canvas-height', String(h));
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [canvasHeight],
  );

  const onAliasOrTagCommit = useCallback(
    (mapSystemId: string, field: 'alias' | 'tag', next: string | null) => {
      onSystemPatch(mapSystemId, { [field]: next });
    },
    [onSystemPatch],
  );

  // ---- xyflow nodes/edges ------------------------------------------------
  //
  // `nodes` is xyflow-managed via `applyNodeChanges` (so the visual drag is
  // smooth — without `onNodesChange` xyflow would emit position events with
  // nowhere to land). When `viewData.systems` or `selected` change we
  // reconcile xyflow's nodes state against them, preserving each node's
  // in-flight drag position (xyflow sets `dragging: true` mid-drag) and
  // xyflow-internal fields (`measured`, etc.) by spreading the existing node
  // — without that xyflow would re-measure on every sync and the nodes
  // briefly flicker out. We sync during render (rather than in an effect) so
  // React discards the pre-sync render before commit instead of cascading.
  // `onAliasOrTagCommit` isn't in the sync key because it's stable for the
  // component's lifetime (its dep chain bottoms out at `mapId` + `useCallback`s
  // with empty deps).
  const [lastSync, setLastSync] = useState<{
    systems: MapViewData['systems'];
    selected: SelectionRef | null;
  } | null>(null);
  if (
    !lastSync ||
    lastSync.systems !== viewData.systems ||
    lastSync.selected !== selected
  ) {
    setLastSync({ systems: viewData.systems, selected });
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return viewData.systems.map((s) => {
        const existing = prevById.get(s.id);
        const position = existing?.dragging
          ? existing.position
          : { x: s.positionX, y: s.positionY };
        return {
          ...(existing ?? {}),
          id: s.id,
          type: 'system' as const,
          position,
          data: { ...s, onAliasOrTagCommit },
          selected: selected?.kind === 'system' && selected.id === s.id,
        };
      });
    });
  }

  const edges = useMemo<Edge<ConnectionEdgeData>[]>(
    () =>
      viewData.connections.map((c) => ({
        id: c.id,
        type: 'connection',
        source: c.source,
        target: c.target,
        data: c,
        selected: selected?.kind === 'connection' && selected.id === c.id,
      })),
    [viewData.connections, selected],
  );

  const selectedSystem: MapSystemNode | null = useMemo(() => {
    if (selected?.kind !== 'system') return null;
    return viewData.systems.find((s) => s.id === selected.id) ?? null;
  }, [selected, viewData.systems]);

  return (
    <MapPresenceProvider initial={data.presence}>
      <div className="flex gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div
            style={{ height: canvasHeight }}
            className="overflow-hidden rounded-lg ring-1 ring-foreground/10"
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              nodesDraggable
              nodesConnectable
              connectionMode={ConnectionMode.Loose}
              edgesFocusable
              colorMode="dark"
              fitView={initialViewport === null}
              defaultViewport={initialViewport ?? undefined}
              zoomOnScroll={false}
              preventScrolling={false}
              onMoveEnd={onMoveEnd}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          {/* Drag handle — resizes the map canvas; sigs panel stays at full height below */}
          <div
            role="separator"
            aria-orientation="horizontal"
            className="-my-2 flex h-4 cursor-ns-resize items-center justify-center"
            onMouseDown={onResizeStart}
          >
            <div className="h-1 w-10 rounded-full bg-border transition-colors hover:bg-foreground/30" />
          </div>

          <SignatureModule
            mapId={mapId}
            system={selectedSystem}
            signatures={viewData.signatures}
            connections={viewData.connections}
            systems={viewData.systems}
            onCreate={onSignatureCreate}
            onPatch={onSignaturePatch}
            onDelete={onSignatureDelete}
            onBulkPaste={onBulkPaste}
          />
        </div>

        <aside className="flex w-80 shrink-0 flex-col gap-4 self-start">
          <InspectorModule
            selected={selected}
            viewData={viewData}
            onSystemPatch={onSystemPatch}
            onSystemRemove={onSystemRemove}
            onConnectionPatch={onConnectionPatch}
            onConnectionDelete={onConnectionDelete}
          />
          <RouteModule
            system={selectedSystem}
            routes={selectedSystem ? routes[selectedSystem.systemId] : undefined}
          />
          <IntelModule
            system={selectedSystem}
            intel={selectedSystem ? intel[selectedSystem.systemId] : undefined}
          />
          <KillStatsModule
            system={selectedSystem}
            stats={selectedSystem ? stats[selectedSystem.systemId] : undefined}
          />
        </aside>
      </div>
    </MapPresenceProvider>
  );
}
