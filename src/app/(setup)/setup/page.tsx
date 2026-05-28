import { desc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { apJobRun } from '@/db/schema';
import { readSetupCookie } from '@/lib/auth/setup-cookie';
import { jobModules } from '@/lib/jobs/registry';
import { RunCronCard } from '@/components/setup/RunCronCard';
import { RunMigrationsCard } from '@/components/setup/RunMigrationsCard';
import { RunSdeIngestCard } from '@/components/setup/RunSdeIngestCard';
import { SetupUnlockForm } from '@/components/setup/SetupUnlockForm';
import { setupLogoutAction } from '@/app/(setup)/actions';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

interface RecentRun {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date | null;
  success: boolean | null;
}

interface StatusSummary {
  recentRuns: RecentRun[];
  latestMigration: string | null;
  recentEventCount: number;
}

async function loadStatus(): Promise<StatusSummary> {
  const recentRows = await db
    .select({
      id: apJobRun.id,
      name: apJobRun.name,
      startedAt: apJobRun.startedAt,
      endedAt: apJobRun.endedAt,
      success: apJobRun.success,
    })
    .from(apJobRun)
    .orderBy(desc(apJobRun.startedAt))
    .limit(20);

  let latestMigration: string | null = null;
  try {
    const row = await db.execute<{ created_at: number | string | null }>(
      sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1`,
    );
    const created = row.rows[0]?.created_at ?? null;
    if (created !== null) latestMigration = String(created);
  } catch {
    latestMigration = null;
  }

  let recentEventCount = 0;
  try {
    const row = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM ap_map_event WHERE occurred_at >= now() - interval '1 hour'`,
    );
    recentEventCount = Number(row.rows[0]?.count ?? 0);
  } catch {
    recentEventCount = 0;
  }

  return {
    recentRuns: recentRows.map((r) => ({
      id: r.id.toString(),
      name: r.name,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      success: r.success,
    })),
    latestMigration,
    recentEventCount,
  };
}

export default async function SetupPage() {
  const unlocked = await readSetupCookie();

  if (!unlocked) {
    return (
      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Setup wizard
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the operator-set <code>SETUP_PASSWORD</code> to unlock the ops console.
          </p>
        </header>
        <SetupUnlockForm />
      </section>
    );
  }

  const status = await loadStatus();
  const knownTaskNames = jobModules()
    .map((m) => m.name)
    .sort();

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Setup wizard
          </h1>
          <p className="text-sm text-muted-foreground">
            On-demand triggers for migrations, static-data ingest, and named jobs.
          </p>
        </div>
        <form
          action={async () => {
            'use server';
            await setupLogoutAction();
          }}
        >
          <Button type="submit" variant="ghost" size="sm">
            Lock
          </Button>
        </form>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <RunMigrationsCard />
        <RunSdeIngestCard />
      </div>

      <CronOnDemand taskNames={knownTaskNames} />

      <StatusPanel status={status} />
    </>
  );
}

function CronOnDemand({ taskNames }: { taskNames: string[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold tracking-tight">
        Run a registered job
      </h2>
      <p className="text-sm text-muted-foreground">
        Enqueues one of the registered graphile-worker tasks with an empty payload.
        Cron-driven jobs will resume their normal cadence after the on-demand run.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {taskNames.map((name) => (
          <RunCronCard key={name} taskName={name} />
        ))}
      </div>
    </section>
  );
}

function StatusPanel({ status }: { status: StatusSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold tracking-tight">Status</h2>
      <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
        <div>
          <div className="font-medium text-foreground">Latest migration</div>
          <div>{status.latestMigration ?? '—'}</div>
        </div>
        <div>
          <div className="font-medium text-foreground">Map events (1h)</div>
          <div>{status.recentEventCount}</div>
        </div>
        <div>
          <div className="font-medium text-foreground">Job rows shown</div>
          <div>{status.recentRuns.length}</div>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Ended</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {status.recentRuns.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                  No job runs recorded yet.
                </td>
              </tr>
            ) : (
              status.recentRuns.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{r.name}</td>
                  <td className="px-3 py-2 text-xs">{r.startedAt.toISOString()}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.endedAt ? r.endedAt.toISOString() : 'in-flight'}
                  </td>
                  <td className="px-3 py-2 text-xs">{statusLabel(r.success, r.endedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function statusLabel(success: boolean | null, endedAt: Date | null): string {
  if (endedAt === null) return 'running';
  if (success === true) return 'ok';
  if (success === false) return 'fail';
  return 'unknown';
}
