'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isWormholeSystem } from '@/lib/map/space';
import type { MapSystemNode } from '@/lib/map/loadMap';
import type { SystemStatsSummary } from '@/lib/map/stats';

// Read-only kill-stats module: rolling-24h jumps / ship / pod / faction kills for
// the selected system, read from ap_system_stats. K-space only (matches legacy
// system_graph); J-space shows n/a. Renders a zero state until the Stage 11
// stats-refresh job populates the table.

const ROWS: { key: keyof SystemStatsSummary; label: string }[] = [
  { key: 'jumps', label: 'Jumps' },
  { key: 'shipKills', label: 'Ship kills' },
  { key: 'podKills', label: 'Pod kills' },
  { key: 'factionKills', label: 'NPC kills' },
];

const EMPTY: SystemStatsSummary = { jumps: 0, shipKills: 0, podKills: 0, factionKills: 0 };

export function KillStatsModule({
  system,
  stats,
}: {
  system: MapSystemNode | null;
  stats: SystemStatsSummary | undefined;
}) {
  const summary = stats ?? EMPTY;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Activity (24h)</CardTitle>
      </CardHeader>
      <CardContent>
        {!system ? (
          <p className="text-xs text-muted-foreground">Select a system to see activity.</p>
        ) : isWormholeSystem(system) ? (
          <p className="text-xs text-muted-foreground">Not tracked in wormhole space.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {ROWS.map((row) => (
              <li key={row.key} className="flex items-center justify-between">
                <span>{row.label}</span>
                <span className="font-mono text-muted-foreground">{summary[row.key]}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
