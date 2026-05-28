'use client';

import { setupRunSdeIngest } from '@/app/(setup)/actions';
import { SetupCard } from './SetupCard';

export function RunSdeIngestCard() {
  return (
    <SetupCard
      title="Refresh static data (SDE)"
      description="Enqueues the sde-ingest graphile-worker task. Downloads the pinned SDE zip and upserts universe_* rows. Long-running; watch ap_job_run for progress."
      buttonLabel="Run SDE ingest"
      pendingLabel="Enqueuing…"
      action={setupRunSdeIngest}
      renderResult={(d) => `Enqueued job ${d.jobId || '(id missing)'}.`}
      successMessage="Queued."
    />
  );
}
