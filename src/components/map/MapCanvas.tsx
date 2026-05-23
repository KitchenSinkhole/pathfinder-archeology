'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MapViewData } from '@/lib/map/loadMap';
import type { HubRoute } from '@/lib/map/route';
import type { SystemStatsSummary } from '@/lib/map/stats';
import { applyEvent } from '@/lib/map/applyEvent';
import { mapUpdateLoadSchema } from '@/lib/realtime/protocol';
import { useMapSubscription, useRealtime } from '@/lib/realtime/useRealtime';
import { RouteModule } from '@/components/sidebar/RouteModule';
import { KillStatsModule } from '@/components/sidebar/KillStatsModule';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewData, setViewData] = useState<MapViewData>(data);
  const appliedEventIds = useRef<Set<number>>(new Set());

  useMapSubscription(Number(data.map.id));

  const { lastEvent } = useRealtime();

  useEffect(() => {
    if (!lastEvent || lastEvent.task !== 'mapUpdate') return;
    const loadResult = mapUpdateLoadSchema.safeParse(lastEvent.load);
    if (!loadResult.success || !loadResult.data.data) return;
    const payload = loadResult.data.data;
    if (appliedEventIds.current.has(payload.eventId)) return;
    appliedEventIds.current.add(payload.eventId);
    setViewData((prev) => applyEvent(prev, payload));
  }, [lastEvent]);

  const nodes = useMemo<Node<SystemNodeData>[]>(
    () =>
      viewData.systems.map((s) => ({
        id: s.id,
        type: 'system',
        position: { x: s.positionX, y: s.positionY },
        data: s,
        draggable: false,
        connectable: false,
      })),
    [viewData.systems],
  );

  const edges = useMemo<Edge<ConnectionEdgeData>[]>(
    () =>
      viewData.connections.map((c) => ({
        id: c.id,
        type: 'connection',
        source: c.source,
        target: c.target,
        data: c,
        selectable: false,
      })),
    [viewData.connections],
  );

  const selected = useMemo(
    () => viewData.systems.find((s) => s.id === selectedId) ?? null,
    [viewData.systems, selectedId],
  );

  function onSelectionChange({ nodes: selectedNodes }: OnSelectionChangeParams) {
    setSelectedId(selectedNodes[0]?.id ?? null);
  }

  return (
    <div className="flex gap-4">
      <div className="h-[72vh] flex-1 overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onSelectionChange={onSelectionChange}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          colorMode="dark"
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <aside className="flex w-72 flex-col gap-4">
        <RouteModule system={selected} routes={selected ? routes[selected.systemId] : undefined} />
        <KillStatsModule
          system={selected}
          stats={selected ? stats[selected.systemId] : undefined}
        />
      </aside>
    </div>
  );
}
