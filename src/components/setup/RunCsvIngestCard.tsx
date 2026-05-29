'use client';

import { setupRunCsvIngest } from '@/app/(setup)/actions';
import { SetupCard } from './SetupCard';

export function RunCsvIngestCard() {
  return (
    <SetupCard
      title="Refresh wormhole CSV data"
      description="Enqueues the csv-ingest graphile-worker task. Re-ingests the vendored wormhole CSVs (statics, overrides, classes) only — does not touch the SDE zip. Requires universe_* tables to be populated first."
      buttonLabel="Run CSV ingest"
      pendingLabel="Enqueuing…"
      action={setupRunCsvIngest}
      renderResult={(d) => `Enqueued job ${d.jobId || '(id missing)'}.`}
      successMessage="Queued."
    />
  );
}
