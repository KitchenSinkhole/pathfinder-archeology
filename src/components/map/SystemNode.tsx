'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Lock } from 'lucide-react';
import type { MapSystemNode } from '@/lib/map/loadMap';
import { systemStatusColor } from './styling';
import { InlineTextEdit } from './InlineTextEdit';

// System tile. Status stripe + security badge + tag + alias/name + lock + a
// J-space statics line. Alias and tag are inline double-click-to-edit; all
// other edits (status, intel, rally, locked) live in the sidebar inspector.

export type SystemNodeData = MapSystemNode & {
  /** Wired by `MapCanvas`; absent on the (now legacy) read-only path. */
  onAliasOrTagCommit?: (mapSystemId: string, field: 'alias' | 'tag', next: string | null) => void;
};

function securityLabel(node: MapSystemNode): string {
  if (node.security) return node.security;
  if (node.trueSec != null) return node.trueSec.toFixed(1);
  return '?';
}

export function SystemNode({ data, selected }: NodeProps & { data: SystemNodeData }) {
  const color = systemStatusColor(data.status);
  const isWormhole = data.statics.length > 0 || /^J\d{6}$/.test(data.name);
  const onAliasOrTagCommit = data.onAliasOrTagCommit;

  return (
    <div
      className="min-w-36 cursor-pointer rounded-md bg-card text-xs text-card-foreground shadow-sm ring-1"
      style={{ borderLeft: `4px solid ${color}`, outline: selected ? `2px solid ${color}` : 'none' }}
      title={`${data.regionName} › ${data.constellationName}`}
    >
      <Handle type="source" position={Position.Top} style={{ opacity: 0.2 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0.2 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0.2 }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0.2 }} />

      <div className="flex items-center gap-1.5 px-2 py-1">
        <span className="rounded bg-muted px-1 font-mono text-[10px] leading-tight text-muted-foreground">
          {securityLabel(data)}
        </span>
        {onAliasOrTagCommit ? (
          <InlineTextEdit
            value={data.tag}
            placeholder=""
            ariaLabel="Tag"
            maxLength={50}
            onCommit={(next) => onAliasOrTagCommit(data.id, 'tag', next)}
            className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary empty:hidden"
            inputClassName="w-12"
          />
        ) : (
          data.tag && (
            <span className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
              {data.tag}
            </span>
          )
        )}
        {onAliasOrTagCommit ? (
          <InlineTextEdit
            value={data.alias}
            placeholder={data.name}
            ariaLabel="Alias"
            maxLength={100}
            onCommit={(next) => onAliasOrTagCommit(data.id, 'alias', next)}
            className="flex-1 truncate font-medium"
            inputClassName="w-full"
          />
        ) : (
          <span className="flex-1 truncate font-medium">{data.alias ?? data.name}</span>
        )}
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
