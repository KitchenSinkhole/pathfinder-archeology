import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { adminVisibilityScope } from '@/lib/auth/rights';
import { listCorpsForAdmin, loadCorpRightsMatrix } from '@/lib/admin/corpRights';
import { CorpRightsMatrix } from '@/components/admin/CorpRightsMatrix';
import { CorpPicker } from '@/components/admin/CorpPicker';

/**
 * Stage 16.5 — `/admin/settings` per-corp rights matrix editor.
 *
 * Admin: a corp picker (`?corp=<id>`) selects which corp's matrix is rendered.
 * Manager: auto-scoped to their own corp; the picker is hidden.
 */
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ corp?: string }>;
}) {
  const session = await auth();
  const scope = await adminVisibilityScope(session);
  if (scope === null) redirect('/maps');

  const corps = await listCorpsForAdmin(scope);

  const { corp: corpParam } = await searchParams;
  const selected = pickCorp({
    corps,
    scope,
    requested: corpParam,
  });

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
        <span className="text-xs text-muted-foreground">
          Scope: {scope.kind === 'global' ? 'global' : `corp ${scope.corporationId.toString()}`}
        </span>
      </header>

      <p className="text-sm text-muted-foreground">
        Per-corporation rights matrix. A character holding the matching corp may exercise
        each right if their <code>authz_level</code> is at or above the chosen floor.
        Selecting <strong>None</strong> removes the grant entirely.
      </p>

      {scope.kind === 'global' && corps.length > 0 && (
        <CorpPicker corps={corps} selectedId={selected?.id ?? null} />
      )}

      {selected === null ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {corps.length === 0
            ? 'No corporations registered yet.'
            : 'Pick a corporation to edit its rights.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-sm font-medium">
            {selected.name}{' '}
            <span className="text-xs text-muted-foreground">
              corp id <code>{selected.id}</code>
            </span>
          </div>
          <MatrixForCorp corporationId={selected.id} />
        </div>
      )}
    </section>
  );
}

function pickCorp({
  corps,
  scope,
  requested,
}: {
  corps: { id: string; name: string; allianceId: string | null }[];
  scope: { kind: 'global' } | { kind: 'corp'; corporationId: bigint };
  requested: string | undefined;
}): { id: string; name: string } | null {
  if (scope.kind === 'corp') {
    const own = corps.find((c) => c.id === scope.corporationId.toString());
    return own ?? null;
  }
  if (requested !== undefined) {
    const match = corps.find((c) => c.id === requested);
    if (match) return match;
  }
  return corps[0] ?? null;
}

async function MatrixForCorp({ corporationId }: { corporationId: string }) {
  const matrix = await loadCorpRightsMatrix(BigInt(corporationId));
  return <CorpRightsMatrix corporationId={corporationId} initial={matrix.rights} />;
}
