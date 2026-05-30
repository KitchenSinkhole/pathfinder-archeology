'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { StatsTable } from '@/components/stats/StatsTable';
import type { ActivityStatPeriod, ActivityStatScope, ActivityStatsResponse } from '@/types';

/**
 * Statistics dialog (Stage 17.7) — global, header-launched per-character activity
 * ranking. Faithful to the legacy `stats.js`: Private / Corp / Alliance scope
 * tabs (only those the account qualifies for, resolved server-side), week / month
 * / year period navigation with prev/next, and a `StatsTable` per scope. All
 * activity is rolled up to account mains. Reads `GET /api/statistics`.
 *
 * The body is mounted only while open so each open starts on the live period;
 * `loading` is derived from a request-key mismatch (rather than a synchronous
 * effect setState) so a refetch dims the table instead of clearing it.
 */
export function StatisticsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Statistics</DialogTitle>
          <DialogDescription>
            Mapping activity by pilot, rolled up to account mains.
          </DialogDescription>
        </DialogHeader>
        {open ? <StatisticsBody /> : null}
      </DialogContent>
    </Dialog>
  );
}

type StatsApiResponse =
  | ({ ok: true; availableScopes: ActivityStatScope[] } & ActivityStatsResponse)
  | { ok: false; error: string; availableScopes?: ActivityStatScope[] };

interface LoadedResult {
  key: string;
  data: ActivityStatsResponse | null;
  error: string | null;
}

const SCOPE_LABEL: Record<ActivityStatScope, string> = {
  private: 'Private',
  corp: 'Corp',
  alliance: 'Alliance',
};

const PERIODS: ActivityStatPeriod[] = ['week', 'month', 'year'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatisticsBody() {
  const [scope, setScope] = useState<ActivityStatScope>('private');
  const [period, setPeriod] = useState<ActivityStatPeriod>('week');
  const [anchor, setAnchor] = useState<string>(todayIso);
  const [availableScopes, setAvailableScopes] = useState<ActivityStatScope[]>(['private']);
  const [result, setResult] = useState<LoadedResult | null>(null);

  const requestKey = `${scope}|${period}|${anchor}`;
  const loading = result?.key !== requestKey;
  const data = result?.data ?? null;
  const error = result?.error ?? null;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({ scope, period, anchor });
    fetch(`/api/statistics?${params}`, { signal: controller.signal, credentials: 'same-origin' })
      .then((res) => res.json() as Promise<StatsApiResponse>)
      .then((json) => {
        if (!active) return;
        if (json.availableScopes) setAvailableScopes(json.availableScopes);
        setResult({
          key: `${scope}|${period}|${anchor}`,
          data: json.ok ? json : null,
          error: json.ok ? null : json.error,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setResult({
          key: `${scope}|${period}|${anchor}`,
          data: null,
          error: err instanceof Error ? err.message : 'Failed to load statistics.',
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [scope, period, anchor]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={scope} onValueChange={(value) => setScope(value as ActivityStatScope)}>
          <TabsList>
            {availableScopes.map((s) => (
              <TabsTab key={s} value={s}>
                {SCOPE_LABEL[s]}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>

        <div className="inline-flex overflow-hidden rounded-md ring-1 ring-foreground/15">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous period"
          disabled={loading || !data}
          onClick={() => data && setAnchor(data.prevAnchor)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-32 text-center text-sm font-medium">{data?.label ?? '…'}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next period"
          disabled={loading || !data || !data.hasNext}
          onClick={() => data?.hasNext && setAnchor(data.nextAnchor)}
        >
          <ChevronRight />
        </Button>
      </div>

      {error ? (
        <p className="px-3 py-8 text-center text-xs text-destructive">{error}</p>
      ) : !data && loading ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : data && data.rows.length > 0 ? (
        <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
          <StatsTable rows={data.rows} />
        </div>
      ) : (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">
          No activity in this period.
        </p>
      )}
    </>
  );
}
