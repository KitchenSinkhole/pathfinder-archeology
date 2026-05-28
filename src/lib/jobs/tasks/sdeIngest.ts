import { runIngest } from '@/lib/sde/ingest';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 16.6 graphile-worker wrapper around `runIngest` (the CLI ingest from
 * `src/lib/sde/ingest.ts` / `pnpm sde:bootstrap`). Enqueued on-demand by the
 * setup wizard so an operator can refresh static data without shelling into
 * the container. No cron — SDE refreshes are deliberate, not periodic; the
 * scheduled-delta job lands in a later stage.
 *
 * The handler does no per-payload work — it forwards to `runIngest()` and
 * returns the row counts as `notes` so `ap_job_run` carries the outcome.
 */

const NAME = 'sde-ingest';

async function ingest() {
  return await runIngest();
}

export const sdeIngest: JobModule = {
  name: NAME,
  run: withInstrumentation(NAME, ingest),
};
