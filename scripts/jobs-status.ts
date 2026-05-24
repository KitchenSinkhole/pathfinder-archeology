import { loadEnvConfig } from '@next/env';

// Match server.ts / worker-dev.ts: load .env BEFORE any env-reading import.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

const WINDOW_HOURS = Number(process.env.JOBS_STATUS_SINCE_HOURS ?? '168'); // 7 days

async function main() {
  const { pool } = await import('@/db/client');
  const { jobModules } = await import('@/lib/jobs/registry');
  const { summary, knownTaskNames } = await import('@/lib/jobs/queries');

  const sinceMs = WINDOW_HOURS * 60 * 60 * 1000;
  const modules = jobModules();
  const summaries = await Promise.all(modules.map((m) => summary(m.name, sinceMs)));
  const knownNames = new Set(await knownTaskNames());
  const registeredNames = new Set(modules.map((m) => m.name));

  const lines: string[] = [];
  lines.push(`Stage 11 job status (last ${WINDOW_HOURS}h):`);
  lines.push('');

  const headers = ['TASK', 'CRON', 'LAST RUN', 'RUNS', 'OK', 'FAIL', 'ABNDND', 'AVG', 'FLAGS'];
  const rows: string[][] = [headers];
  for (let i = 0; i < modules.length; i += 1) {
    const m = modules[i]!;
    const s = summaries[i]!;
    rows.push([
      m.name,
      m.cron ?? '—',
      formatAge(s.lastStartedAt),
      String(s.runCount),
      String(s.successCount),
      String(s.failCount),
      String(s.abandonedCount),
      formatDuration(s.avgDurationMs),
      formatFlags(m.name, s),
    ]);
  }
  for (const line of renderTable(rows)) lines.push('  ' + line);

  const orphans = [...knownNames].filter((n) => !registeredNames.has(n));
  const neverRan = [...registeredNames].filter((n) => !knownNames.has(n));
  lines.push('');
  lines.push(`Tasks with rows but not in registry: ${orphans.length ? orphans.join(', ') : '(none)'}`);
  lines.push(`Tasks registered but never run: ${neverRan.length ? neverRan.join(', ') : '(none)'}`);

  process.stdout.write(lines.join('\n') + '\n');
  await pool.end();
}

function formatAge(t: Date | null): string {
  if (!t) return 'never';
  const secs = Math.floor((Date.now() - t.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatFlags(name: string, s: { failCount: number; abandonedCount: number; lastSuccess: boolean | null }): string {
  const flags: string[] = [];
  if (name === 'structure-resolve') flags.push('STUB(stage-17)');
  if (s.abandonedCount > 0) flags.push(`ABANDONED:${s.abandonedCount}`);
  if (s.lastSuccess === false) flags.push('LAST:FAIL');
  return flags.join(' ');
}

function renderTable(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => r.map((c, i) => c.padEnd(widths[i]!)).join('  '));
}

main().catch(async (err) => {
  console.error('jobs:status failed:', err);
  process.exit(1);
});
