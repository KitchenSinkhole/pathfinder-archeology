'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TAG_STRATEGIES } from '@/lib/tagging/registry';
import type { TagContext } from '@/lib/tagging/types';
import type { MapViewData } from '@/lib/map/loadMap';

/**
 * Auto-tagging "next available" side panel (Stage 17.10). Reuses the pure
 * `availableTags` strategy over the live `viewData`, so it updates as discovery
 * events fold onto the canvas. Hidden entirely when the map runs no scheme. The
 * active scheme comes from `viewData.map.tagScheme` (config is load-time, not
 * realtime — see `loadMap.ts`).
 */
export function TagsModule({
  viewData,
  selectedSystemId,
}: {
  viewData: MapViewData;
  selectedSystemId: string | null;
}) {
  const scheme = viewData.map.tagScheme;

  const available = useMemo(() => {
    if (scheme === 'none') return null;
    const ctx: TagContext = {
      scheme,
      homeMapSystemId:
        viewData.map.homeMapSystemId === null ? null : BigInt(viewData.map.homeMapSystemId),
      systems: viewData.systems.map((s) => ({
        mapSystemId: BigInt(s.id),
        systemId: s.systemId,
        tag: s.tag,
        securityClass: s.security,
      })),
      connections: viewData.connections.map((c) => ({
        source: BigInt(c.source),
        target: BigInt(c.target),
      })),
    };
    const selected = selectedSystemId === null ? null : BigInt(selectedSystemId);
    return TAG_STRATEGIES[scheme].availableTags(ctx, selected);
  }, [scheme, viewData.map.homeMapSystemId, viewData.systems, viewData.connections, selectedSystemId]);

  if (available === null) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Next tags</CardTitle>
      </CardHeader>
      <CardContent>
        {available.scheme === 'abc' ? (
          <ul className="flex flex-col gap-1 text-xs">
            {available.perClass.map((row) => (
              <li key={row.classLabel} className="flex items-center justify-between">
                <span className="text-muted-foreground">{row.classLabel}</span>
                <span className="font-mono">
                  {row.next.map((t) => `${t}`).join('  ')}
                </span>
              </li>
            ))}
          </ul>
        ) : available.perParent.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Set a Home system in map settings to start the chain.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {available.perParent.map((row) => (
              <li
                key={row.parentMapSystemId ?? 'home'}
                className="flex items-center justify-between"
              >
                <span className="text-muted-foreground">{row.parentLabel}</span>
                <span className="font-mono">{row.next}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
