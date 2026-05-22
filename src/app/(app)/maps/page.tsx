import Link from 'next/link';
import { getActiveCharacter } from '@/lib/session';
import { listViewableMaps } from '@/lib/map/loadMap';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function MapsPage() {
  const [active, maps] = await Promise.all([getActiveCharacter(), listViewableMaps()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Maps</h1>
        {active && <p className="text-sm text-muted-foreground">Signed in as {active.name}.</p>}
      </div>

      {maps.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No maps yet</CardTitle>
            <CardDescription>Map creation arrives in a later stage.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Once maps land, your private, corp, and alliance maps will appear here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((m) => (
            <Link key={m.id} href={{ pathname: `/map/${m.id}` }} className="block">
              <Card size="sm" className="transition-colors hover:ring-foreground/25">
                <CardHeader>
                  <CardTitle>{m.name}</CardTitle>
                  <CardDescription className="capitalize">
                    {m.type} · {m.scope}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
