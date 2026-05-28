'use client';

import { useState, useTransition } from 'react';
import { Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  adminCreateWebhook,
  adminUpdateWebhook,
} from '@/app/(admin)/actions/webhooks';

type WebhookChannel = 'discord';
type WebhookEvent = 'history' | 'rally';

const CHANNEL_OPTIONS: { value: WebhookChannel; label: string }[] = [
  { value: 'discord', label: 'Discord' },
];
const CHANNEL_LABELS = Object.fromEntries(CHANNEL_OPTIONS.map((o) => [o.value, o.label]));

const EVENT_OPTIONS: { value: WebhookEvent; label: string }[] = [
  { value: 'history', label: 'History (every event)' },
  { value: 'rally', label: 'Rally (rally-set only)' },
];
const EVENT_LABELS = Object.fromEntries(EVENT_OPTIONS.map((o) => [o.value, o.label]));

export type WebhookFormProps =
  | {
      mode: 'create';
      mapId: string;
    }
  | {
      mode: 'edit';
      webhook: {
        id: string;
        channel: WebhookChannel;
        event: WebhookEvent;
        url: string;
        username: string | null;
      };
      onDone?: () => void;
    };

/**
 * Controlled form for creating or editing a single `ap_map_webhook` row.
 * `channel` and `event` are immutable post-create (the action enforces this);
 * the edit variant shows them read-only.
 */
export function WebhookForm(props: WebhookFormProps) {
  if (props.mode === 'create') {
    return <CreateForm mapId={props.mapId} />;
  }
  return <EditForm webhook={props.webhook} onDone={props.onDone} />;
}

function CreateForm({ mapId }: { mapId: string }) {
  const [channel, setChannel] = useState<WebhookChannel>('discord');
  const [event, setEvent] = useState<WebhookEvent>('history');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error('URL is required.');
      return;
    }
    startTransition(async () => {
      const result = await adminCreateWebhook({
        mapId,
        channel,
        event,
        url: trimmedUrl,
        username: username.trim() || undefined,
      });
      if (result.ok) {
        toast.success('Webhook added.');
        setUrl('');
        setUsername('');
        setEvent('history');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-medium">Add webhook</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Channel">
          <Select<WebhookChannel>
            value={channel}
            onValueChange={(v) => v && setChannel(v)}
            items={CHANNEL_LABELS}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Event">
          <Select<WebhookEvent>
            value={event}
            onValueChange={(v) => v && setEvent(v)}
            items={EVENT_LABELS}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="URL">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          maxLength={2000}
          required
        />
      </Field>

      <Field label="Username override (optional)">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Aperture"
          maxLength={80}
        />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Plus />
          {pending ? 'Adding…' : 'Add webhook'}
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  webhook,
  onDone,
}: {
  webhook: {
    id: string;
    channel: WebhookChannel;
    event: WebhookEvent;
    url: string;
    username: string | null;
  };
  onDone?: () => void;
}) {
  const [url, setUrl] = useState(webhook.url);
  const [username, setUsername] = useState(webhook.username ?? '');
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error('URL is required.');
      return;
    }
    startTransition(async () => {
      const result = await adminUpdateWebhook({
        id: webhook.id,
        url: trimmedUrl,
        username: username.trim() || undefined,
      });
      if (result.ok) {
        toast.success('Webhook updated.');
        onDone?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <span>
          Channel: <span className="font-medium text-foreground">{webhook.channel}</span>
        </span>
        <span>
          Event: <span className="font-medium text-foreground">{webhook.event}</span>
        </span>
      </div>

      <Field label="URL">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          maxLength={2000}
          required
          autoFocus
        />
      </Field>

      <Field label="Username override (optional)">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Aperture"
          maxLength={80}
        />
      </Field>

      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          <Save />
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
