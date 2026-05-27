import { redirect } from 'next/navigation';
import { and, count, eq, exists, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { apCharacter, apMap, apMapWebhook } from '@/db/schema';
import { adminVisibilityScope, type AdminVisibilityScope } from '@/lib/auth/rights';
import { auth } from '@/lib/auth';

function mapScopeFilter(scope: AdminVisibilityScope): SQL | undefined {
  if (scope.kind === 'global') return undefined;
  const corpChars = db
    .select({ id: apCharacter.id })
    .from(apCharacter)
    .where(eq(apCharacter.corporationId, scope.corporationId));
  const clauses: SQL[] = [
    eq(apMap.ownerCorporationId, scope.corporationId),
    inArray(apMap.ownerCharacterId, corpChars),
  ];
  if (scope.allianceId !== null) {
    clauses.push(eq(apMap.ownerAllianceId, scope.allianceId));
  }
  return or(...clauses);
}

function characterScopeFilter(scope: AdminVisibilityScope): SQL | undefined {
  if (scope.kind === 'global') return undefined;
  return eq(apCharacter.corporationId, scope.corporationId);
}

async function countMaps(scope: AdminVisibilityScope, deleted: boolean): Promise<number> {
  const deletedClause = deleted ? isNotNull(apMap.deletedAt) : isNull(apMap.deletedAt);
  const [row] = await db
    .select({ n: count() })
    .from(apMap)
    .where(and(deletedClause, mapScopeFilter(scope)));
  return row?.n ?? 0;
}

async function countCharacters(
  scope: AdminVisibilityScope,
  status: 'kicked' | 'banned',
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(apCharacter)
    .where(and(eq(apCharacter.status, status), characterScopeFilter(scope)));
  return row?.n ?? 0;
}

async function countFailingWebhooks(scope: AdminVisibilityScope): Promise<number> {
  const mapFilter = mapScopeFilter(scope);
  const scopedMapExists = exists(
    db
      .select({ one: apMap.id })
      .from(apMap)
      .where(and(eq(apMap.id, apMapWebhook.mapId), mapFilter)),
  );
  const where =
    scope.kind === 'global'
      ? gt(apMapWebhook.consecutiveFailures, 0)
      : and(gt(apMapWebhook.consecutiveFailures, 0), scopedMapExists);
  const [row] = await db.select({ n: count() }).from(apMapWebhook).where(where);
  return row?.n ?? 0;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const session = await auth();
  const scope = await adminVisibilityScope(session);
  if (scope === null) redirect('/maps');

  const [activeMaps, deletedMaps, kicked, banned, failingWebhooks] = await Promise.all([
    countMaps(scope, false),
    countMaps(scope, true),
    countCharacters(scope, 'kicked'),
    countCharacters(scope, 'banned'),
    countFailingWebhooks(scope),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <span className="text-xs text-muted-foreground">
          Scope: {scope.kind === 'global' ? 'global' : `corp ${scope.corporationId.toString()}`}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Active maps" value={activeMaps} />
        <StatCard label="Soft-deleted maps" value={deletedMaps} />
        <StatCard label="Kicked characters" value={kicked} />
        <StatCard label="Banned characters" value={banned} />
        <StatCard label="Failing webhooks" value={failingWebhooks} />
      </div>
    </section>
  );
}
