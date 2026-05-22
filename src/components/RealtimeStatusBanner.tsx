'use client';

import { useRealtime } from '@/lib/realtime/useRealtime';

/**
 * Degraded-mode banner (SPEC §71 NFR / CLAUDE.md "Realtime"): when the realtime
 * socket is anything other than `open`, the UI must say so rather than silently
 * rendering stale state. Renders nothing while healthy.
 */
export function RealtimeStatusBanner() {
  const { status } = useRealtime();
  if (status === 'open') return null;

  const message =
    status === 'connecting'
      ? 'Connecting to live updates…'
      : 'Live updates are unavailable — the map may be out of date.';

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-700 dark:text-amber-300"
    >
      {message}
    </div>
  );
}
