'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { isWormholeSystem } from '@/lib/map/space';
import type { MapSystemNode } from '@/lib/map/loadMap';
import type { GraphRange, SystemStatsPoint } from '@/lib/map/stats';

// Dotlan-style activity graphs for the selected K-space system (Stage 17.8):
// small-multiple area charts over ap_system_stats (jumps / ship kills / NPC
// kills). Wormholes have no K-space stats feed, so they show an n/a state
// (matching KillStatsModule via the shared isWormholeSystem helper). Fetches
// /api/system/[id]/graph on selection / range change and fills sparse buckets
// with zeros client-side.

type GraphResponse = { ok: true; series: SystemStatsPoint[] } | { ok: false; error: string };

const RANGES: GraphRange[] = ['24h', '7d', '30d'];

const RANGE_META: Record<GraphRange, { count: number; stepMs: number; unit: 'hour' | 'day' }> = {
  '24h': { count: 24, stepMs: 3_600_000, unit: 'hour' },
  '7d': { count: 7, stepMs: 86_400_000, unit: 'day' },
  '30d': { count: 30, stepMs: 86_400_000, unit: 'day' },
};

const METRICS: { key: keyof SystemStatsPoint; label: string; className: string }[] = [
  { key: 'jumps', label: 'Jumps', className: 'text-sky-400' },
  { key: 'shipKills', label: 'Ship kills', className: 'text-rose-400' },
  { key: 'factionKills', label: 'NPC kills', className: 'text-amber-400' },
];

// Metric values are `number | null`: a present bucket carries its recorded
// count (possibly a genuine 0), an absent bucket carries `null` so the chart
// breaks the line rather than implying zero activity for an unmeasured hour.
type FilledPoint = { label: string } & Record<'jumps' | 'shipKills' | 'podKills' | 'factionKills', number | null>;

function truncUtc(ms: number, unit: 'hour' | 'day'): number {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  if (unit === 'day') d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function formatLabel(ms: number, unit: 'hour' | 'day'): string {
  const d = new Date(ms);
  return unit === 'hour'
    ? `${String(d.getUTCHours()).padStart(2, '0')}:00`
    : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// Build the contiguous bucket grid (the series is sparse). Buckets present in
// the series carry their recorded counts; absent buckets carry `null` so the
// chart breaks the line — a collection gap (e.g. the refresh job wasn't running
// that hour) must read as "no data", not as zero activity. Buckets align to
// UTC, matching the SQL date_trunc.
function fillSeries(points: SystemStatsPoint[], range: GraphRange): FilledPoint[] {
  const { count, stepMs, unit } = RANGE_META[range];
  const byBucket = new Map(points.map((p) => [truncUtc(new Date(p.bucket).getTime(), unit), p]));
  const end = truncUtc(Date.now(), unit);
  const out: FilledPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = end - i * stepMs;
    const p = byBucket.get(t);
    out.push({
      label: formatLabel(t, unit),
      jumps: p ? p.jumps : null,
      shipKills: p ? p.shipKills : null,
      podKills: p ? p.podKills : null,
      factionKills: p ? p.factionKills : null,
    });
  }
  return out;
}

export function SystemGraphModule({ system }: { system: MapSystemNode | null }) {
  const [range, setRange] = useState<GraphRange>('24h');
  const [data, setData] = useState<FilledPoint[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const isWormhole = system ? isWormholeSystem(system) : false;
  const systemId = !system || isWormhole ? null : system.systemId;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      if (systemId == null) {
        setData(null);
        setStatus('idle');
        return;
      }
      setStatus('loading');
      try {
        const res = await fetch(`/api/system/${systemId}/graph?range=${range}`, {
          signal: controller.signal,
          credentials: 'same-origin',
        });
        const json = (await res.json()) as GraphResponse;
        if (!active) return;
        if (json.ok) {
          setData(fillSeries(json.series, range));
          setStatus('idle');
        } else {
          setData(null);
          setStatus('error');
        }
      } catch {
        if (!active || controller.signal.aborted) return;
        setStatus('error');
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [systemId, range]);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Activity graph</CardTitle>
      </CardHeader>
      <CardContent className="text-xs">
        {!system ? (
          <p className="text-muted-foreground">Select a system to see activity graphs.</p>
        ) : isWormhole ? (
          <p className="text-muted-foreground">Not tracked in wormhole space.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="inline-flex self-end overflow-hidden rounded-md ring-1 ring-foreground/15">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    range === r
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {status === 'error' ? (
              <p className="text-destructive">Failed to load graph.</p>
            ) : !data ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              METRICS.map((metric) => (
                <div key={metric.key} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-muted-foreground">{metric.label}</span>
                  <ChartContainer className={`h-20 ${metric.className}`}>
                    <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 2, left: 2 }}>
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={24}
                        tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
                        height={14}
                      />
                      <YAxis
                        width={20}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tickCount={3}
                        tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent />}
                      />
                      <Area
                        type="monotone"
                        dataKey={metric.key}
                        name={metric.label}
                        stroke="currentColor"
                        fill="currentColor"
                        fillOpacity={0.15}
                        strokeWidth={1.5}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ChartContainer>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
