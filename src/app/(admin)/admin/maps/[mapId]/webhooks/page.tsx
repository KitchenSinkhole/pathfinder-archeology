import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, sql } from 'drizzle-orm';
import { ChevronLeft } from 'lucide-react';
import { db } from '@/db/client';
import { apMap, apMapWebhook } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
  adminVisibilityScope,
  isManagerOrAdmin,
  mapScopeFilterFor,
} from '@/lib/auth/rights';
import { WebhookForm } from '@/components/admin/WebhookForm';
import { WebhookHealthBadge } from '@/components/admin/WebhookHealthBadge';
import { WebhookRowActions } from '@/components/admin/WebhookRowActions';

function parseMapId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

type WebhookChannel = 'discord';
type WebhookEvent = 'history' | 'rally';

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
    const tail = last.length > 6 ? `…${last.slice(-4)}` : last;
    return `${u.host}/…/${tail}`;
  } catch {
    return url.length > 40 ? `${url.slice(0, 37)}…` : url;
  }
}

export default async function AdminMapWebhooksPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId: rawMapId } = await params;
  const mapId = parseMapId(rawMapId);
  if (mapId === null) notFound();

  const session = await auth();
  if (!(await isManagerOrAdmin(session))) redirect('/maps');
  const scope = await adminVisibilityScope(session);
  if (scope === null) redirect('/maps');

  const [map] = await db
    .select({ id: apMap.id, name: apMap.name })
    .from(apMap)
    .where(and(eq(apMap.id, mapId), mapScopeFilterFor(scope) ?? sql`true`));
  if (!map) notFound();

  const webhooks = await db
    .select({
      id: apMapWebhook.id,
      channel: apMapWebhook.channel,
      event: apMapWebhook.event,
      url: apMapWebhook.url,
      username: apMapWebhook.username,
      lastStatus: apMapWebhook.lastStatus,
      lastError: apMapWebhook.lastError,
      lastAttemptedAt: apMapWebhook.lastAttemptedAt,
      consecutiveFailures: apMapWebhook.consecutiveFailures,
    })
    .from(apMapWebhook)
    .where(eq(apMapWebhook.mapId, mapId))
    .orderBy(asc(apMapWebhook.event), asc(apMapWebhook.id));

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href={{ pathname: '/admin/maps' }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3" />
            Back to maps
          </Link>
          <h1 className="text-xl font-semibold">
            Webhooks — <span className="text-muted-foreground">{map.name}</span>
          </h1>
        </div>
        <span className="text-xs text-muted-foreground">
          Map id <code>{map.id.toString()}</code>
        </span>
      </header>

      {webhooks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No webhooks configured for this map yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">Health</th>
                <th className="px-3 py-2 font-medium">Last attempt</th>
                <th className="w-px px-3 py-2 font-medium" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id.toString()} className="border-t border-border">
                  <td className="px-3 py-2 align-middle capitalize">{w.event}</td>
                  <td className="px-3 py-2 align-middle capitalize text-muted-foreground">
                    {w.channel}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <code
                      className="rounded bg-muted px-1.5 py-0.5 text-xs"
                      title={w.url}
                    >
                      {maskUrl(w.url)}
                    </code>
                    {w.username && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        as “{w.username}”
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <WebhookHealthBadge
                      lastStatus={w.lastStatus}
                      consecutiveFailures={w.consecutiveFailures}
                      lastError={w.lastError}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
                    {w.lastAttemptedAt
                      ? DATE_FORMAT.format(new Date(w.lastAttemptedAt))
                      : '—'}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <WebhookRowActions
                      webhook={{
                        id: w.id.toString(),
                        channel: w.channel as WebhookChannel,
                        event: w.event as WebhookEvent,
                        url: w.url,
                        username: w.username,
                        consecutiveFailures: w.consecutiveFailures,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WebhookForm mode="create" mapId={map.id.toString()} />
    </section>
  );
}
