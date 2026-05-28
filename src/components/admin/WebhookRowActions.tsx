'use client';

import { useState, useTransition } from 'react';
import { Pencil, RotateCcw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  adminDeleteWebhook,
  adminResetWebhookFailures,
  adminTestWebhook,
} from '@/app/(admin)/actions/webhooks';
import { WebhookForm } from './WebhookForm';

type WebhookChannel = 'discord';
type WebhookEvent = 'history' | 'rally';

export type WebhookRowActionsProps = {
  webhook: {
    id: string;
    channel: WebhookChannel;
    event: WebhookEvent;
    url: string;
    username: string | null;
    consecutiveFailures: number;
  };
};

/**
 * Per-row action cluster for the Stage 16.4 webhook list: test-fire, reset
 * failure counter (only when failing), edit (dialog wrapping `WebhookForm`),
 * and delete (confirm dialog).
 */
export function WebhookRowActions({ webhook }: WebhookRowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      <TestButton webhook={webhook} />
      {webhook.consecutiveFailures > 0 && <ResetButton webhook={webhook} />}
      <EditButton webhook={webhook} />
      <DeleteButton webhook={webhook} />
    </div>
  );
}

function TestButton({ webhook }: { webhook: WebhookRowActionsProps['webhook'] }) {
  const [pending, startTransition] = useTransition();
  function onClick() {
    startTransition(async () => {
      const result = await adminTestWebhook(webhook.id);
      if (result.ok) toast.success('Test fired — reload in a moment to see the status.');
      else toast.error(result.error);
    });
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Test fire"
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:text-foreground"
    >
      <Send />
    </Button>
  );
}

function ResetButton({ webhook }: { webhook: WebhookRowActionsProps['webhook'] }) {
  const [pending, startTransition] = useTransition();
  function onClick() {
    startTransition(async () => {
      const result = await adminResetWebhookFailures(webhook.id);
      if (result.ok) toast.success('Failure counter cleared.');
      else toast.error(result.error);
    });
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Reset failure counter"
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:text-foreground"
    >
      <RotateCcw />
    </Button>
  );
}

function EditButton({ webhook }: { webhook: WebhookRowActionsProps['webhook'] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit webhook"
            className="text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Pencil />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit webhook</DialogTitle>
          <DialogDescription>
            Channel and event class are immutable. Delete and re-add to change them.
          </DialogDescription>
        </DialogHeader>
        <WebhookForm
          mode="edit"
          webhook={webhook}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ webhook }: { webhook: WebhookRowActionsProps['webhook'] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await adminDeleteWebhook(webhook.id);
      if (result.ok) {
        toast.success('Webhook removed.');
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete webhook"
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2 />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove webhook?</DialogTitle>
          <DialogDescription>
            This webhook will stop receiving map events immediately. The Discord channel
            itself is not touched — re-adding the URL restores the subscription.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="ghost" disabled={pending} />}
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Removing…' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
