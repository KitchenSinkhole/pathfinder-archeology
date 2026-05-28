'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type ActionResult<T> = { ok: true; data: T } | { ok: true } | { ok: false; error: string };

interface SetupCardProps<T> {
  title: string;
  description: string;
  buttonLabel: string;
  pendingLabel?: string;
  action: () => Promise<ActionResult<T>>;
  renderResult?: (data: T) => string;
  successMessage?: string;
}

/**
 * Single-purpose card with a description, an action button, and a result
 * readout. Used for each of the three setup-wizard triggers (migrations, SDE
 * ingest, on-demand cron). Keeps the spinner / toast / result-line plumbing in
 * one place so the page just wires actions into instances.
 */
export function SetupCard<T>({
  title,
  description,
  buttonLabel,
  pendingLabel,
  action,
  renderResult,
  successMessage,
}: SetupCardProps<T>) {
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  function onClick() {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        const detail =
          renderResult && 'data' in result ? renderResult((result as { data: T }).data) : null;
        const message = successMessage ?? 'Done.';
        toast.success(detail ? `${message} ${detail}` : message);
        setLast(detail ?? message);
      } else {
        toast.error(result.error);
        setLast(`Error: ${result.error}`);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button type="button" onClick={onClick} disabled={pending} className="self-start">
          {pending ? (pendingLabel ?? `${buttonLabel}…`) : buttonLabel}
        </Button>
        {last !== null && (
          <p className="text-xs text-muted-foreground" data-slot="setup-card-result">
            {last}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
