'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MapSystemNode } from '@/lib/map/loadMap';
import type { HubRoute } from '@/lib/map/route';

// Read-only route module: gate jumps from the selected system to the configured
// trade hubs. No find-route dialog or inputs — the interactive finder arrives
// with edit affordances in a later stage.

export function RouteModule({
  system,
  routes,
}: {
  system: MapSystemNode | null;
  routes: HubRoute[] | undefined;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Route</CardTitle>
      </CardHeader>
      <CardContent>
        {!system ? (
          <p className="text-xs text-muted-foreground">Select a system to see hub routes.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {(routes ?? []).map((hub) => (
              <li key={hub.systemId} className="flex items-center justify-between">
                <span>{hub.name}</span>
                <span className="font-mono text-muted-foreground">
                  {hub.jumps == null ? '—' : `${hub.jumps} j`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
