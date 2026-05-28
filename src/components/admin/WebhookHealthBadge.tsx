import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WebhookHealthBadgeProps = {
  /** HTTP status of the last delivery attempt; null when never attempted. */
  lastStatus: number | null;
  consecutiveFailures: number;
  /** Last failure's truncated error text, when `consecutiveFailures > 0`. */
  lastError: string | null;
};

/**
 * Compact status pill for a single `ap_map_webhook` row. Three states map
 * straight onto the observability columns the dispatcher writes:
 *
 *   - never attempted (lastStatus === null && consecutiveFailures === 0) → "untested"
 *   - failing (consecutiveFailures > 0) → red badge with count
 *   - healthy (lastStatus is 2xx and consecutiveFailures === 0) → green check + status
 */
export function WebhookHealthBadge({
  lastStatus,
  consecutiveFailures,
  lastError,
}: WebhookHealthBadgeProps) {
  if (consecutiveFailures > 0) {
    const title = lastError ?? `Last status: ${lastStatus ?? 'unknown'}`;
    return (
      <span
        title={title}
        className={cn(
          'inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive',
        )}
      >
        <AlertTriangle className="size-3" aria-hidden />
        {consecutiveFailures} consecutive failure{consecutiveFailures === 1 ? '' : 's'}
      </span>
    );
  }

  if (lastStatus === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <CircleDashed className="size-3" aria-hidden />
        Untested
      </span>
    );
  }

  return (
    <span
      title={`Last status: ${lastStatus}`}
      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
    >
      <CheckCircle2 className="size-3" aria-hidden />
      OK ({lastStatus})
    </span>
  );
}
