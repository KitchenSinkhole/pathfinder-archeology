import type { MapConnectionEdge, MapSystemNode } from '@/lib/map/loadMap';

// Legacy visual fidelity for the read-only map. Pathfinder encodes status and
// connection state purely as colour/stroke; we mirror the semantics (not exact
// legacy hex) with explicit values so the canvas is readable without Tailwind
// tokens leaking into SVG.

// Covers universe_system.security labels: H, L, 0.0, C1–C6, P (Pochven), A (Abyssal).
// C1–C6 progress from cool blue to orangy-red to signal increasing danger.
const SYSTEM_CLASS_COLORS: Partial<Record<string, string>> = {
  H: '#22c55e',    // high-sec — green
  L: '#fb923c',    // low-sec — orange
  '0.0': '#dc2626', // null-sec — firetruck red
  P: '#9f1239',    // Pochven — deep red with purple
  A: '#2dd4bf',    // Abyssal — teal
  C1: '#38bdf8',
  C2: '#06b6d4',
  C3: '#9ab910',
  C4: '#eab308',
  C5: '#f97316',
  C6: '#ea580c',   // orangy-red
};

/** Colour for a `universe_system.security` or `universe_wormhole.target_class` label. */
export function systemClassColor(cls: string | null | undefined): string {
  if (!cls) return '#6b7280';
  return SYSTEM_CLASS_COLORS[cls] ?? '#6b7280';
}

const STATUS_COLORS: Record<MapSystemNode['status'], string> = {
  unknown: '#6b7280',
  friendly: '#3b82f6',
  occupied: '#f59e0b',
  hostile: '#ef4444',
  empty: '#22c55e',
  unscanned: '#a855f7',
};

export function systemStatusColor(status: MapSystemNode['status']): string {
  return STATUS_COLORS[status];
}

const MASS_COLORS: Record<MapConnectionEdge['massStatus'], string> = {
  fresh: '#84cc16',
  reduced: '#f59e0b',
  critical: '#ef4444',
};

const SCOPE_COLORS: Record<MapConnectionEdge['scope'], string> = {
  wh: '#cbd5e1',
  stargate: '#4ade80',
  jumpbridge: '#a855f7',
  abyssal: '#f97316',
};

export type EdgeStyle = {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
};

/**
 * Stroke styling for a connection. Scope picks the base colour; wormholes are
 * recoloured by mass status. EOL connections dash; frigate holes thin out.
 */
export function connectionStyle(edge: MapConnectionEdge): EdgeStyle {
  const stroke = edge.scope === 'wh' ? MASS_COLORS[edge.massStatus] : SCOPE_COLORS[edge.scope];
  return {
    stroke,
    strokeWidth: edge.jumpMassClass === 's' ? 1.5 : 3,
    strokeDasharray: edge.isEol ? '6 4' : undefined,
  };
}

/** Short labels stacked on a connection (EOL / rolling / preserve / frigate / size). */
export function connectionBadges(edge: MapConnectionEdge): string[] {
  const badges: string[] = [];
  if (edge.jumpMassClass) badges.push(edge.jumpMassClass.toUpperCase());
  if (edge.isEol) badges.push('EOL');
  if (edge.isRolling) badges.push('ROLL');
  if (edge.preserveMass) badges.push('PRES');
  return badges;
}
