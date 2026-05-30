'use client';

import { useEffect, useRef, useState } from 'react';
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
import { useTravelForConnection } from './MapTravelContext';

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

export type ConnectionEdgeData = MapConnectionEdge & {
  /** 0-based index of this edge among all parallel edges between the same node pair. */
  parallelIndex: number;
  /** Total number of edges between this node pair (1 = only edge, no offset applied). */
  parallelCount: number;
};

const PARALLEL_STEP_PX = 12;

type Anchor = { x: number; y: number; position: Position };

// `offset` shifts the anchor along the node face perpendicular to the
// dominant axis, so parallel edges between the same pair fan out visibly.
function pickAnchors(
  src: { x: number; y: number; w: number; h: number },
  tgt: { x: number; y: number; w: number; h: number },
  offset = 0,
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
        source: { x: src.x + src.w, y: sCy + offset, position: Position.Right },
        target: { x: tgt.x, y: tCy + offset, position: Position.Left },
      };
    }
    return {
      source: { x: src.x, y: sCy + offset, position: Position.Left },
      target: { x: tgt.x + tgt.w, y: tCy + offset, position: Position.Right },
    };
  }
  if (dy >= 0) {
    return {
      source: { x: sCx + offset, y: src.y + src.h, position: Position.Bottom },
      target: { x: tCx + offset, y: tgt.y, position: Position.Top },
    };
  }
  return {
    source: { x: sCx + offset, y: src.y, position: Position.Top },
    target: { x: tCx + offset, y: tgt.y + tgt.h, position: Position.Bottom },
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

  const { parallelIndex, parallelCount } = data;
  const offset =
    parallelCount > 1 ? (parallelIndex - (parallelCount - 1) / 2) * PARALLEL_STEP_PX : 0;

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
        offset,
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
  const travel = useTravelForConnection(props.id);

  return (
    <>
      <BaseEdge path={path} style={finalStyle} />
      {travel && (
        <TravelDot
          key={travel.token}
          path={path}
          direction={travel.direction}
          color={style.stroke}
        />
      )}
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

// A faint dot that glides once along the connection curve in the travel
// direction when a tracked pilot jumps across it. Mounted (and remounted via
// `key={token}`) per jump.
//
// The SMIL `<animateMotion>` is kicked imperatively with `beginElement()` on
// mount instead of relying on the default `begin="0s"`: a begin offset is
// resolved against the SVG document timeline (page load), so on a long-lived
// canvas "0s" is already in the past by the time a jump happens and the browser
// renders the animation as already-finished — the dot would snap to the curve's
// end and never move. `begin="indefinite"` + `beginElement()` starts it at the
// current document time so it actually plays. animateMotion runs source→target
// by default; reverse traverses the path backwards via `keyPoints`.
function TravelDot({
  path,
  direction,
  color,
}: {
  path: string;
  direction: 'forward' | 'reverse';
  color?: string;
}) {
  const motionRef = useRef<SVGAnimateMotionElement>(null);
  useEffect(() => {
    motionRef.current?.beginElement();
  }, []);
  return (
    <circle r={5} fill={color} opacity={0.55}>
      <animateMotion
        ref={motionRef}
        begin="indefinite"
        dur="1.2s"
        path={path}
        fill="freeze"
        {...(direction === 'reverse'
          ? { keyPoints: '1;0', keyTimes: '0;1', calcMode: 'linear' as const }
          : {})}
      />
    </circle>
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
