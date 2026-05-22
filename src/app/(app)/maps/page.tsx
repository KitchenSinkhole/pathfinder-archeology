import { getActiveCharacter } from '@/lib/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function MapsPage() {
  const active = await getActiveCharacter();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Maps</h1>
        {active && <p className="text-sm text-muted-foreground">Signed in as {active.name}.</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>No maps yet</CardTitle>
          <CardDescription>
            Map creation and the chain view arrive in a later stage.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Once maps land, your private, corp, and alliance maps will appear here.
        </CardContent>
      </Card>
    </div>
  );
}
