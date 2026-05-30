'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { MapSystemNode } from '@/lib/map/loadMap';
import type { KillboardKill } from '@/lib/map/killboard';

// Recent-kills feed for the selected system (Stage 17.8). Fetches the zkb-backed
// /api/system/[id]/killboard on selection, with a manual refresh. Works for all
// systems including wormholes (zKillboard tracks J-space kills). Kills live in
// local state keyed by killmailId so the Stage 17.8b live killstream can prepend
// into the same list without a refetch.

const KILL_LIMIT = 20;

type KillboardResponse = { ok: true; kills: KillboardKill[] } | { ok: false; error: string };

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

function formatIsk(value: number | null): string {
  if (value == null) return 'n/a';
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}b`;
  if (value >= 1e6) return `${Math.round(value / 1e6)}m`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`;
  return `${Math.round(value)}`;
}

export function SystemKillboardModule({ system }: { system: MapSystemNode | null }) {
  const [kills, setKills] = useState<KillboardKill[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const systemId = system?.systemId ?? null;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      if (systemId == null) {
        setKills([]);
        setStatus('idle');
        setError(null);
        return;
      }
      setStatus('loading');
      setError(null);
      try {
        const res = await fetch(`/api/system/${systemId}/killboard?limit=${KILL_LIMIT}`, {
          signal: controller.signal,
          credentials: 'same-origin',
        });
        const json = (await res.json()) as KillboardResponse;
        if (!active) return;
        if (json.ok) {
          setKills(json.kills);
          setStatus('idle');
        } else {
          setKills([]);
          setError(json.error);
          setStatus('error');
        }
      } catch (err: unknown) {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load killboard.');
        setStatus('error');
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [systemId, reload]);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Killboard</CardTitle>
        {system ? (
          <CardAction>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh killboard"
              disabled={status === 'loading'}
              onClick={() => setReload((n) => n + 1)}
            >
              <RefreshCw className={status === 'loading' ? 'animate-spin' : undefined} />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="text-xs">
        {!system ? (
          <p className="text-muted-foreground">Select a system to see recent kills.</p>
        ) : status === 'error' ? (
          <p className="text-destructive">{error}</p>
        ) : kills.length === 0 ? (
          <p className="text-muted-foreground">
            {status === 'loading' ? 'Loading…' : 'No recent kills.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {kills.map((kill) => (
              <li key={kill.killmailId} className="flex items-center gap-2">
                {kill.shipIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={kill.shipIcon} alt="" className="size-8 shrink-0 rounded-sm" />
                ) : (
                  <span className="size-8 shrink-0 rounded-sm bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {kill.shipName ?? `Kill #${kill.killmailId}`}
                  </div>
                  <div className="truncate text-muted-foreground">
                    {kill.victimName ?? 'Unknown pilot'}
                    {kill.attackers != null ? ` · ${kill.attackers} involved` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="">{relativeTime(kill.killmailTime)}</span>
                  <span className="font-mono text-muted-foreground">{formatIsk(kill.totalValue)}</span>
                </div>
                <a
                  href={kill.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Killmail ${kill.killmailId} on zKillboard`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
