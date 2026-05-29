import type { CronItem, Task, TaskList } from 'graphile-worker';
import { activityRollupRefresh } from './tasks/activityRollupRefresh';
import { characterCleanup } from './tasks/characterCleanup';
import { csvIngest } from './tasks/csvIngest';
import { eolExpiry } from './tasks/eolExpiry';
import { expiredConnections } from './tasks/expiredConnections';
import { locationPoll } from './tasks/locationPoll';
import { mapPurge } from './tasks/mapPurge';
import { partitionMaintenance } from './tasks/partitionMaintenance';
import { sdeIngest } from './tasks/sdeIngest';
import { signatureReap } from './tasks/signatureReap';
import { sovFwRefresh } from './tasks/sovFwRefresh';
import { systemStatsRefresh } from './tasks/systemStatsRefresh';
import { webhookDispatch } from './tasks/webhookDispatch';

/**
 * The registry every Stage-11 task module is bound to. Each `JobModule` exports
 * `{ name, cron?, run }`; this file imports them and indexes:
 *
 *   - `tasks`     — graphile-worker `TaskList` (`{ [name]: run }`)
 *   - `cronItems` — graphile-worker `CronItem[]` (one entry per cron-driven task)
 *
 * Sub-stages 11.2–11.6 add new task modules to the `modules` list below; the
 * derived `tasks` / `cronItems` exports update automatically.
 *
 * No directory-based task loading (`taskDirectory`) on purpose — explicit
 * imports keep the registry greppable and ESM-friendly under `tsx`.
 */
export interface JobModule {
  /** graphile-worker task identifier (e.g. `'signature-reap'`). Globally unique. */
  name: string;
  /**
   * Cron expression (5-field graphile-worker syntax). Omit for tasks
   * scheduled by `addJob` rather than cron.
   */
  cron?: string;
  /** Instrumented handler — typically the return value of `withInstrumentation(name, raw)`. */
  run: Task;
}

const modules: readonly JobModule[] = [
  // Stage 11.2 — map housekeeping (signature reap, EOL/expired connections, map purge).
  signatureReap,
  eolExpiry,
  expiredConnections,
  mapPurge,
  // Stage 11.3 — per-system stats refresh from ESI.
  systemStatsRefresh,
  sovFwRefresh,
  // Stage 11.4 — activity-log materialized-view refresh.
  activityRollupRefresh,
  // Stage 11.5 — pg_partman maintenance (premake + retention).
  partitionMaintenance,
  // Stage 11.6 registered a `structure-resolve` ESI stub; Stage 17.1 retired it.
  // ESI cannot return other corps' structures, so structure intel is manual
  // entry (`ap_structure`) with no recurring resolve work. See
  // docs/plans/stage-17-ui-catchup.md.
  // Stage 12.1 — per-character location poll (no cron; self-re-enqueueing).
  locationPoll,
  // Stage 14 — per-event Discord webhook dispatch (no cron; enqueued by commitMapEvent).
  webhookDispatch,
  // Stage 15.6 — kick expiry + periodic authz resync (replaces legacy cleanUpCharacterData).
  characterCleanup,
  // Stage 16.6 — on-demand SDE refresh, enqueued by the setup wizard.
  sdeIngest,
  // On-demand vendored-CSV refresh, enqueued by the setup wizard's dedicated card.
  csvIngest,
];

export function jobModules(): readonly JobModule[] {
  return modules;
}

/**
 * The subset of jobs the `/setup` ops console may enqueue on-demand with an
 * empty payload. Restricted to cron-driven tasks: those run unattended on a
 * schedule and therefore take no required payload, so an empty `'{}'` enqueue
 * is always valid. Payload-driven `addJob`-only tasks (`location-poll`,
 * `webhook-dispatch`) are excluded — enqueuing them payload-less crashes the
 * handler. `sde-ingest` and `csv-ingest` are also payload-less but have their
 * own dedicated console cards, so they aren't surfaced in the generic list.
 */
export function onDemandJobModules(): readonly JobModule[] {
  return modules.filter((m) => m.cron !== undefined);
}

export function buildTaskList(extra: readonly JobModule[] = []): TaskList {
  const out: TaskList = {};
  for (const m of [...modules, ...extra]) {
    if (out[m.name]) throw new Error(`duplicate job name '${m.name}' in registry`);
    out[m.name] = m.run;
  }
  return out;
}

export function buildCronItems(extra: readonly JobModule[] = []): CronItem[] {
  const out: CronItem[] = [];
  for (const m of [...modules, ...extra]) {
    if (m.cron) out.push({ task: m.name, match: m.cron, identifier: m.name });
  }
  return out;
}
