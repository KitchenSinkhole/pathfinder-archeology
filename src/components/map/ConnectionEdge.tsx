'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import type { MapConnectionEdge } from '@/lib/map/loadMap';
import { connectionBadges, connectionStyle } from './styling';

// Read-only connection edge. Scope + mass status drive the stroke colour; EOL
// dashes the line; flags (jump-mass / EOL / frigate / rolling / preserve) render
// as small badges at the midpoint. No detach handle — editing is a later stage.

export type ConnectionEdgeData = MapConnectionEdge;

export function ConnectionEdge(props: EdgeProps & { data: ConnectionEdgeData }) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const style = connectionStyle(data);
  const badges = connectionBadges(data);

  return (
    <>
      <BaseEdge path={path} style={style} />
      {badges.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute flex gap-0.5 rounded bg-card/90 px-1 py-0.5 text-[9px] font-medium leading-none ring-1 ring-foreground/10"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {badges.map((b) => (
              <span key={b} style={{ color: style.stroke }}>
                {b}
              </span>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
