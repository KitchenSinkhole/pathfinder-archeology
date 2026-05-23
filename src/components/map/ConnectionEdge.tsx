'use client';

import { useEffect, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
} from '@xyflow/react';
import type { MapConnectionEdge } from '@/lib/map/loadMap';
import { connectionTimeLeftMs } from '@/lib/map/connectionState';
import { formatRelativeFromMs } from '@/lib/map/relativeTime';
import { connectionBadges, connectionStyle } from './styling';

const EOL_COUNTDOWN_TICK_MS = 30_000;

// Selectable connection edge. Scope + mass status drive the stroke colour; EOL
// dashes the line; flags (jump-mass / EOL / frigate / rolling / preserve) render
// as small badges at the midpoint. Edits live in the sidebar inspector — clicking
// the edge merely selects it.
//
// Edge endpoints snap to whichever of the four node sides face each other based
// on the dominant axis between the two node centres, so the line exits and
// enters from the sides closest to the other node rather than always running
// bottom-to-top.

export type ConnectionEdgeData = MapConnectionEdge;

type Anchor = { x: number; y: number; position: Position };

function pickAnchors(
  src: { x: number; y: number; w: number; h: number },
  tgt: { x: number; y: number; w: number; h: number },
): { source: Anchor; target: Anchor } {
  const sCx = src.x + src.w / 2;
  const sCy = src.y + src.h / 2;
  const tCx = tgt.x + tgt.w / 2;
  const tCy = tgt.y + tgt.h / 2;
  const dx = tCx - sCx;
  const dy = tCy - sCy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return {
        source: { x: src.x + src.w, y: sCy, position: Position.Right },
        target: { x: tgt.x, y: tCy, position: Position.Left },
      };
    }
    return {
      source: { x: src.x, y: sCy, position: Position.Left },
      target: { x: tgt.x + tgt.w, y: tCy, position: Position.Right },
    };
  }
  if (dy >= 0) {
    return {
      source: { x: sCx, y: src.y + src.h, position: Position.Bottom },
      target: { x: tCx, y: tgt.y, position: Position.Top },
    };
  }
  return {
    source: { x: sCx, y: src.y, position: Position.Top },
    target: { x: tCx, y: tgt.y + tgt.h, position: Position.Bottom },
  };
}

export function ConnectionEdge(props: EdgeProps & { data: ConnectionEdgeData }) {
  const {
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  } = props;

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const sPos = sourceNode?.internals.positionAbsolute;
  const tPos = targetNode?.internals.positionAbsolute;
  const sW = sourceNode?.measured.width;
  const sH = sourceNode?.measured.height;
  const tW = targetNode?.measured.width;
  const tH = targetNode?.measured.height;

  const anchors =
    sPos && tPos && sW && sH && tW && tH
      ? pickAnchors(
          { x: sPos.x, y: sPos.y, w: sW, h: sH },
          { x: tPos.x, y: tPos.y, w: tW, h: tH },
        )
      : null;

  const [path, labelX, labelY] = getBezierPath({
    sourceX: anchors?.source.x ?? sourceX,
    sourceY: anchors?.source.y ?? sourceY,
    sourcePosition: anchors?.source.position ?? sourcePosition,
    targetX: anchors?.target.x ?? targetX,
    targetY: anchors?.target.y ?? targetY,
    targetPosition: anchors?.target.position ?? targetPosition,
  });
  const style = connectionStyle(data);
  const finalStyle = selected ? { ...style, strokeWidth: (style.strokeWidth ?? 3) + 2 } : style;
  const badges = connectionBadges(data);
  const countdown = useEolCountdown(data);
  const hasLabel = badges.length > 0 || countdown !== null;

  return (
    <>
      <BaseEdge path={path} style={finalStyle} />
      {hasLabel && (
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
            {countdown !== null && (
              <span className="text-muted-foreground" aria-label="EOL time remaining">
                {countdown}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Ticks the EOL-flagged edge label once every 30s. Returns null when the
// connection has no expiry (non-WH) or is not EOL — the pre-EOL "expires in"
// hint only surfaces in the inspector to avoid cluttering every WH edge.
function useEolCountdown(c: MapConnectionEdge): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!c.isEol) return;
    const id = setInterval(() => setNow(Date.now()), EOL_COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [c.isEol]);
  if (!c.isEol) return null;
  const ms = connectionTimeLeftMs(c, now);
  if (ms === null) return null;
  return formatRelativeFromMs(ms);
}
