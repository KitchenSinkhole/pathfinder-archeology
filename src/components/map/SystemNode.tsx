'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Lock } from 'lucide-react';
import type { MapSystemNode } from '@/lib/map/loadMap';
import { systemStatusColor } from './styling';

// Read-only system tile. Mirrors the legacy head row: status stripe, security
// badge, optional tag, alias-or-name, lock indicator, plus a J-space statics
// line. No drag handle, no editing — the canvas is read-only this stage.

export type SystemNodeData = MapSystemNode;

function securityLabel(node: MapSystemNode): string {
  if (node.security) return node.security;
  if (node.trueSec != null) return node.trueSec.toFixed(1);
  return '?';
}

export function SystemNode({ data, selected }: NodeProps & { data: SystemNodeData }) {
  const color = systemStatusColor(data.status);
  const isWormhole = data.statics.length > 0 || /^J\d{6}$/.test(data.name);

  return (
    <div
      className="min-w-36 rounded-md bg-card text-xs text-card-foreground shadow-sm ring-1"
      style={{ borderLeft: `4px solid ${color}`, outline: selected ? `2px solid ${color}` : 'none' }}
      title={`${data.regionName} › ${data.constellationName}`}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />

      <div className="flex items-center gap-1.5 px-2 py-1">
        <span className="rounded bg-muted px-1 font-mono text-[10px] leading-tight text-muted-foreground">
          {securityLabel(data)}
        </span>
        {data.tag && (
          <span className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
            {data.tag}
          </span>
        )}
        <span className="flex-1 truncate font-medium">{data.alias ?? data.name}</span>
        {data.locked && <Lock className="size-3 text-muted-foreground" />}
      </div>

      {(isWormhole || data.effect) && (
        <div className="flex items-center gap-1 border-t border-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground">
          {data.effect && <span className="capitalize">{data.effect}</span>}
          {data.statics.length > 0 && <span className="truncate">{data.statics.join(' · ')}</span>}
        </div>
      )}
    </div>
  );
}
