'use client';

import { useMemo, useState } from 'react';
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
import { RouteModule } from '@/components/sidebar/RouteModule';
import { KillStatsModule } from '@/components/sidebar/KillStatsModule';
import { useMapSubscription } from '@/lib/realtime/useRealtime';
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

  // Subscribe this map's channel for the lifetime of the canvas. Stage 8 only
  // opens the channel; applying live updates to the canvas is Stage 9.
  useMapSubscription(Number(data.map.id));

  const nodes = useMemo<Node<SystemNodeData>[]>(
    () =>
      data.systems.map((s) => ({
        id: s.id,
        type: 'system',
        position: { x: s.positionX, y: s.positionY },
        data: s,
        draggable: false,
        connectable: false,
      })),
    [data.systems],
  );

  const edges = useMemo<Edge<ConnectionEdgeData>[]>(
    () =>
      data.connections.map((c) => ({
        id: c.id,
        type: 'connection',
        source: c.source,
        target: c.target,
        data: c,
        selectable: false,
      })),
    [data.connections],
  );

  const selected = useMemo(
    () => data.systems.find((s) => s.id === selectedId) ?? null,
    [data.systems, selectedId],
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
