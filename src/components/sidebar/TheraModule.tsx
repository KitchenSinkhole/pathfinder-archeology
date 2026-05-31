'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { systemClassColor } from '@/components/map/styling';
import { fetchTheraConnections, syncTheraConnectionsOnServer } from '@/lib/map/client';
import type { MapViewData } from '@/lib/map/loadMap';
import type { MapEventPayload, TheraConnection, TheraSyncInput } from '@/types';

// Stage 17.9 global Thera module. Lists EVE-Scout's published Thera + Turnur
// connections and folds chosen ones onto the open map. Unlike the system-scoped
// sidebar modules this is always-on (not gated on a selected system) — the
// legacy `global_thera.js` was global scope. Per-row sync status is computed
// client-side from live `viewData`, so it re-derives for free as systems/edges
// arrive (own sync or a peer's realtime echo).

type Status = 'idle' | 'loading' | 'error';

/** A `TheraConnection` annotated with whether its hub↔target edge is already on the map. */
type AnnotatedConnection = TheraConnection & { onMap: boolean };

function toSyncInput(c: TheraConnection): TheraSyncInput {
  return {
    hubSystemId: c.hubSystemId,
    hubName: c.hubName,
    targetSystemId: c.targetSystemId,
    signatureId: c.signatureId,
  };
}

export function TheraModule({
  mapId,
  viewData,
  onBulkPaste,
}: {
  mapId: string;
  viewData: MapViewData;
  onBulkPaste: (payloads: MapEventPayload[]) => void;
}) {
  const [connections, setConnections] = useState<TheraConnection[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setStatus('loading');
      setError(null);
      const result = await fetchTheraConnections({ mapId });
      if (!active) return;
      if (result.ok) {
        setConnections(result.data);
        setStatus('idle');
      } else {
        setConnections([]);
        setError(result.error);
        setStatus('error');
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [mapId, reload]);

  // Resolve each EVE-Scout row's on-map status against live view state: the
  // hub and target must both be placed and a connection must link them.
  const annotated = useMemo<AnnotatedConnection[]>(() => {
    const mapSystemByEveId = new Map<number, string>();
    for (const s of viewData.systems) mapSystemByEveId.set(s.systemId, s.id);
    const edgeKeys = new Set<string>();
    for (const c of viewData.connections) edgeKeys.add([c.source, c.target].sort().join('|'));

    return connections.map((c) => {
      const hubMapId = mapSystemByEveId.get(c.hubSystemId);
      const targetMapId = mapSystemByEveId.get(c.targetSystemId);
      const onMap =
        hubMapId != null &&
        targetMapId != null &&
        edgeKeys.has([hubMapId, targetMapId].sort().join('|'));
      return { ...c, onMap };
    });
  }, [connections, viewData.systems, viewData.connections]);

  const groups = useMemo(() => {
    const thera = annotated.filter((c) => c.hub === 'Thera');
    const turnur = annotated.filter((c) => c.hub === 'Turnur');
    const byName = (a: AnnotatedConnection, b: AnnotatedConnection) =>
      a.targetName.localeCompare(b.targetName);
    return [
      { hub: 'Thera' as const, rows: thera.sort(byName) },
      { hub: 'Turnur' as const, rows: turnur.sort(byName) },
    ].filter((g) => g.rows.length > 0);
  }, [annotated]);

  const missing = useMemo(() => annotated.filter((c) => !c.onMap), [annotated]);

  const sync = useCallback(
    async (rows: TheraConnection[]) => {
      if (rows.length === 0) return;
      setSyncing(true);
      try {
        const result = await syncTheraConnectionsOnServer({
          mapId,
          connections: rows.map(toSyncInput),
        });
        if (result.ok) onBulkPaste(result.data.payloads);
      } finally {
        setSyncing(false);
      }
    },
    [mapId, onBulkPaste],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Thera connections</CardTitle>
        <CardAction className="flex items-center gap-1">
          {/* <Button
            variant="ghost"
            size="sm"
            disabled={syncing || missing.length === 0}
            onClick={() => void sync(missing)}
          >
            Sync all
          </Button> */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh Thera connections"
            disabled={status === 'loading'}
            onClick={() => setReload((n) => n + 1)}
          >
            <RefreshCw className={status === 'loading' ? 'animate-spin' : undefined} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="text-xs">
        {status === 'error' ? (
          <p className="text-destructive">{error}</p>
        ) : annotated.length === 0 ? (
          <p className="text-muted-foreground">
            {status === 'loading' ? 'Loading…' : 'No active connections.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div key={group.hub} className="flex flex-col gap-1">
                <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.hub}
                </div>
                <ul className="flex flex-col gap-1">
                  {group.rows.map((row) => (
                    <li
                      key={`${row.hubSystemId}-${row.targetSystemId}-${row.signatureId ?? ''}`}
                      className="flex items-center gap-2"
                    >
                      <span
                        aria-hidden
                        title={row.onMap ? 'On map' : 'Not on map'}
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: row.onMap ? '#22c55e' : '#f59e0b' }}
                      />
                      <span className="min-w-0 flex-1 truncate">{row.targetName}</span>
                      <span
                        className="shrink-0 font-mono"
                        style={{ color: systemClassColor(row.securityClass) }}
                      >
                        {row.securityClass ?? '—'}
                      </span>
                      {row.onMap ? (
                        <span className="w-6 shrink-0 text-center text-muted-foreground">✓</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Add ${row.targetName} to map`}
                          disabled={syncing}
                          onClick={() => void sync([row])}
                        >
                          <Plus />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
