import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MapCanvas } from '@/components/map/MapCanvas';
import { loadMapForView, loadMapSettings } from '@/lib/map/loadMap';
import { routesForSystems } from '@/lib/map/route';
import { statsForSystems } from '@/lib/map/stats';
import { intelForSystems } from '@/lib/map/intel';
import { structuresForSystems } from '@/lib/structures/read';
import { getConnectionTravelAnimation, requireSession } from '@/lib/session';

function parseMapId(slug?: string[]): bigint | null {
  const raw = slug?.[0];
  if (!raw || !/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export default async function MapPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const session = await requireSession();
  const { slug } = await params;
  const mapId = parseMapId(slug);

  if (mapId === null) {
    return (
      <EmptyState
        title="No map selected"
        description="Pick a map from your maps list to view its chain."
      />
    );
  }

  const data = await loadMapForView(mapId, BigInt(session.characterId));
  if (!data) {
    return (
      <EmptyState title="Map not found" description="This map doesn't exist or has been deleted." />
    );
  }

  const systemIds = data.systems.map((s) => s.systemId);
  const [routes, stats, intel, structures, settings, travelAnimation] = await Promise.all([
    routesForSystems(systemIds),
    statsForSystems(systemIds),
    intelForSystems(systemIds),
    structuresForSystems(systemIds),
    loadMapSettings(BigInt(session.characterId), mapId),
    getConnectionTravelAnimation(session.userId),
  ]);

  // Non-null because `loadMapForView` already succeeded for the same viewer/map.
  if (!settings) {
    return (
      <EmptyState title="Map not found" description="This map doesn't exist or has been deleted." />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{data.map.name}</h1>
        <p className="text-sm text-muted-foreground capitalize">
          {data.map.type} · {data.map.scope} · {data.systems.length} systems
        </p>
      </div>
      <MapCanvas
        data={data}
        routes={routes}
        stats={stats}
        intel={intel}
        structures={structures}
        settings={settings}
        travelAnimation={travelAnimation}
      />
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        <Link href="/maps" className="text-primary hover:underline">
          Back to maps
        </Link>
      </CardContent>
    </Card>
  );
}
