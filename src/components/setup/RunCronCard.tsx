'use client';

import { useCallback } from 'react';
import { setupRunCronOnDemand } from '@/app/(setup)/actions';
import { SetupCard } from './SetupCard';

export function RunCronCard({ taskName }: { taskName: string }) {
  const action = useCallback(() => setupRunCronOnDemand(taskName), [taskName]);
  return (
    <SetupCard
      title={taskName}
      description="Enqueue this task immediately."
      buttonLabel="Enqueue"
      pendingLabel="Enqueuing…"
      action={action}
      renderResult={(d) => `Job ${d.jobId || '(id missing)'}.`}
      successMessage="Queued."
    />
  );
}
