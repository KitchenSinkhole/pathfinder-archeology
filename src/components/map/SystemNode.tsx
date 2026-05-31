'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { PreviewCard } from '@base-ui/react/preview-card';
import { Lock, Users } from 'lucide-react';
import type { MapSystemNode } from '@/lib/map/loadMap';
import { systemClassColor, systemStatusColor } from './styling';
import { InlineTextEdit } from './InlineTextEdit';
import { usePresenceForSystem } from './MapPresenceContext';
import { useUnderglowForSystem } from './MapUnderglowContext';
import { SystemUnderglow } from './SystemUnderglow';

// System tile. Status stripe + security badge + tag + alias/name + presence
// badge + lock + a J-space statics line. Alias and tag are inline
// double-click-to-edit; all other edits (status, intel, rally, locked) live in
// the sidebar inspector. The presence badge shows the count of online tracked
// pilots currently in this system, with a hover panel listing each pilot and
// their ship (legacy Pathfinder parity).

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
  const pilots = usePresenceForSystem(data.systemId);
  const glow = useUnderglowForSystem(data.id);

  return (
    <div
      className="relative min-w-36 cursor-pointer rounded-md bg-card text-xs text-card-foreground shadow-sm ring-1"
      style={{ borderLeft: `4px solid ${color}`, outline: selected ? `2px solid ${color}` : 'none' }}
      title={`${data.regionName} › ${data.constellationName}`}
    >
      {glow && <SystemUnderglow key={glow.token} {...glow.config} />}
      <Handle type="source" position={Position.Top} style={{ opacity: 0.2 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0.2 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0.2 }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0.2 }} />

      <div className="flex items-center px-2 py-1">
        <span
          className="rounded bg-muted px-0.5 font-mono text-[10px] leading-tight"
          style={{ color: systemClassColor(data.security) }}
        >
          {securityLabel(data)}
        </span>
        {onAliasOrTagCommit ? (
          <InlineTextEdit
            value={data.tag}
            placeholder=""
            ariaLabel="Tag"
            maxLength={50}
            onCommit={(next) => onAliasOrTagCommit(data.id, 'tag', next)}
            className="rounded bg-primary/15 px-0.5 text-[10px] font-mono leading-tight empty:hidden"
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
            className="flex-1 truncate font-medium pl-1"
            inputClassName="w-full"
          />
        ) : (
          <span className="flex-1 truncate font-medium">{data.alias ?? data.name}</span>
        )}
        {pilots.length > 0 && <PresenceBadge pilots={pilots} />}
        {data.locked && <Lock className="size-3 text-muted-foreground" />}
      </div>

      {(isWormhole || data.effect) && (
        <div className="flex items-center gap-1 border-t border-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground">
          {data.effect && <span className="capitalize">{data.effect}</span>}
          {data.statics.length > 0 && (
            <span className="flex items-center gap-1">
              {data.statics.map((cls, i) => (
                <span key={i} className="font-bold" style={{ color: systemClassColor(cls) }}>{cls}</span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PresenceBadge({
  pilots,
}: {
  pilots: readonly import('@/lib/map/loadMap').MapPresenceEntry[];
}) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        // `nodrag nopan` so opening the hover panel doesn't trigger xyflow's
        // pan/drag — same pattern as InlineTextEdit. Render as a button so
        // it's keyboard-focusable; default `<a>` would suggest a navigation.
        render={<button type="button" />}
        className="nodrag nopan inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-tight text-primary-foreground"
        aria-label={`${pilots.length} pilot${pilots.length === 1 ? '' : 's'} in system`}
      >
        <Users className="size-2.5" aria-hidden />
        {pilots.length}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={4} side="top" align="end">
          <PreviewCard.Popup className="nodrag nopan z-50 min-w-40 rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
            <ul className="space-y-0.5">
              {pilots.map((p) => (
                <li key={p.characterId} className="flex items-start justify-between gap-3">
                  <span className="font-medium">{p.characterName}</span>
                  <span className="flex flex-col items-end text-right text-muted-foreground">
                    <span>{p.shipName ?? p.shipTypeName ?? '—'}</span>
                    {/* Custom ship name and type both shown; the type line is
                        omitted when the pilot never renamed the hull (ESI
                        defaults ship_name to the type name). */}
                    {p.shipName && p.shipTypeName && p.shipName !== p.shipTypeName && (
                      <span className="text-[10px] text-muted-foreground/70">{p.shipTypeName}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
