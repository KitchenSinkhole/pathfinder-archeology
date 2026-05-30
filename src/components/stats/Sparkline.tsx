'use client';

/**
 * Tiny inline-SVG sparkline (Stage 17.7) — renders a normalized polyline over a
 * numeric series. No chart dependency; Stage 17.8 picks a real chart lib for the
 * larger system graphs. A flat or empty series degrades to a baseline.
 */
export function Sparkline({
  data,
  width = 80,
  height = 20,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const max = Math.max(0, ...data);
  const n = data.length;
  // Pad so single-point / empty series still draw a baseline.
  const points =
    n <= 1
      ? `0,${height - 1} ${width},${height - 1}`
      : data
          .map((v, i) => {
            const x = (i / (n - 1)) * width;
            const y = max === 0 ? height - 1 : height - 1 - (v / max) * (height - 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
