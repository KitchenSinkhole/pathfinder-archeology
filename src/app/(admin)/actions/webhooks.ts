'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { apMap, apMapWebhook, apWebhookChannel, apWebhookEvent } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
  adminVisibilityScope,
  isManagerOrAdmin,
  mapScopeFilterFor,
  type AdminVisibilityScope,
} from '@/lib/auth/rights';

/**
 * Stage 16.4 admin actions on `ap_map_webhook` rows. Five operations exposed
 * at `/admin/maps/[mapId]/webhooks`: create, update, delete, reset failures,
 * test fire. All gated by `isManagerOrAdmin` + a per-map scope check via
 * `mapScopeFilterFor` — a manager can only edit webhooks for maps within their
 * corp scope; admins see every map.
 *
 * No `ap_map_event` row is written for webhook config changes — webhook
 * subscriptions are infrastructure, not map state, and `ap_map_event` is
 * map-state-only (see Stage 16 plan, "What is intentionally NOT in scope").
 * `revalidatePath` is enough to keep the panel fresh after every edit.
 */

const mapIdSchema = z.string().regex(/^\d+$/, 'Invalid map id.');
const webhookIdSchema = z.string().regex(/^\d+$/, 'Invalid webhook id.');
const channelSchema = z.enum(apWebhookChannel.enumValues);
const eventSchema = z.enum(apWebhookEvent.enumValues);
const urlSchema = z.string().url('Webhook URL must be a valid URL.').max(2000);
const usernameSchema = z
  .string()
  .trim()
  .max(80)
  .transform((s) => (s.length === 0 ? null : s))
  .nullable()
  .optional();

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

async function gateForMap(
  mapId: bigint,
): Promise<
  | { ok: true; scope: AdminVisibilityScope }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!(await isManagerOrAdmin(session))) {
    return { ok: false, error: 'Forbidden.' };
  }
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Forbidden.' };

  const [row] = await db
    .select({ id: apMap.id })
    .from(apMap)
    .where(and(eq(apMap.id, mapId), mapScopeFilterFor(scope) ?? sql`true`));
  if (!row) return { ok: false, error: 'Map not found.' };
  return { ok: true, scope };
}

async function gateForWebhook(
  webhookId: bigint,
): Promise<
  | { ok: true; scope: AdminVisibilityScope; mapId: bigint }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!(await isManagerOrAdmin(session))) {
    return { ok: false, error: 'Forbidden.' };
  }
  const scope = await adminVisibilityScope(session);
  if (scope === null) return { ok: false, error: 'Forbidden.' };

  const [row] = await db
    .select({ mapId: apMapWebhook.mapId })
    .from(apMapWebhook)
    .innerJoin(apMap, eq(apMap.id, apMapWebhook.mapId))
    .where(and(eq(apMapWebhook.id, webhookId), mapScopeFilterFor(scope) ?? sql`true`));
  if (!row) return { ok: false, error: 'Webhook not found.' };
  return { ok: true, scope, mapId: row.mapId };
}

const createSchema = z.object({
  mapId: mapIdSchema,
  channel: channelSchema,
  event: eventSchema,
  url: urlSchema,
  username: usernameSchema,
});

/**
 * Insert a new `ap_map_webhook` row for the target map. Bound by the
 * `ap_map_webhook_map_channel_event_uq` unique constraint — duplicate
 * (map, channel, event) tuples surface as a clear conflict message.
 */
export async function adminCreateWebhook(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const mapId = BigInt(parsed.data.mapId);
  const gate = await gateForMap(mapId);
  if (!gate.ok) return gate;

  try {
    const [row] = await db
      .insert(apMapWebhook)
      .values({
        mapId,
        channel: parsed.data.channel,
        event: parsed.data.event,
        url: parsed.data.url,
        username: parsed.data.username ?? null,
      })
      .returning({ id: apMapWebhook.id });
    revalidatePath(`/admin/maps/${mapId.toString()}/webhooks`);
    return { ok: true, data: { id: row!.id.toString() } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Insert failed.';
    if (/ap_map_webhook_map_channel_event_uq/.test(message)) {
      return {
        ok: false,
        error: 'A webhook for this map / channel / event already exists.',
      };
    }
    return { ok: false, error: message };
  }
}

const updateSchema = z.object({
  id: webhookIdSchema,
  url: urlSchema.optional(),
  username: usernameSchema,
});

/**
 * Patch the URL or username on an existing webhook row. Channel + event are
 * immutable (delete + recreate to change those).
 */
export async function adminUpdateWebhook(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const id = BigInt(parsed.data.id);
  const gate = await gateForWebhook(id);
  if (!gate.ok) return gate;

  const patch: Partial<{ url: string; username: string | null }> = {};
  if (parsed.data.url !== undefined) patch.url = parsed.data.url;
  if (parsed.data.username !== undefined) patch.username = parsed.data.username;
  if (Object.keys(patch).length === 0) return { ok: true };

  await db
    .update(apMapWebhook)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(apMapWebhook.id, id));

  revalidatePath(`/admin/maps/${gate.mapId.toString()}/webhooks`);
  return { ok: true };
}

/**
 * Hard-delete a webhook row. Per CLAUDE.md "lifecycle patterns", there is no
 * `active` flag — unsubscribing == removing the row.
 */
export async function adminDeleteWebhook(id: string): Promise<ActionResult> {
  const parsed = webhookIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const webhookId = BigInt(parsed.data);
  const gate = await gateForWebhook(webhookId);
  if (!gate.ok) return gate;

  await db.delete(apMapWebhook).where(eq(apMapWebhook.id, webhookId));
  revalidatePath(`/admin/maps/${gate.mapId.toString()}/webhooks`);
  return { ok: true };
}

/**
 * Zero `consecutive_failures` and clear `last_error` — operator dismisses a
 * failure flag after fixing the URL or the channel permissions. Does NOT
 * touch `last_status` / `last_attempted_at`: those stay as the last actual
 * delivery's facts so future operators can still see what happened.
 */
export async function adminResetWebhookFailures(id: string): Promise<ActionResult> {
  const parsed = webhookIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const webhookId = BigInt(parsed.data);
  const gate = await gateForWebhook(webhookId);
  if (!gate.ok) return gate;

  await db
    .update(apMapWebhook)
    .set({ consecutiveFailures: 0, lastError: null, updatedAt: new Date() })
    .where(eq(apMapWebhook.id, webhookId));

  revalidatePath(`/admin/maps/${gate.mapId.toString()}/webhooks`);
  return { ok: true };
}

/**
 * Enqueue a synthetic `webhook-dispatch` job that targets this single webhook
 * with a `[test]` Discord message. The job handler (`webhookDispatch.ts`)
 * detects the `test: true` discriminator and calls
 * `runTestWebhookDispatch`, which writes back `last_status` /
 * `last_attempted_at` / `consecutive_failures` exactly like a real dispatch.
 *
 * Returns once the job is enqueued — the actual Discord POST happens on the
 * worker tick. Operators see the result by reloading the page (the row's
 * health badge updates from the new `last_status`).
 */
export async function adminTestWebhook(id: string): Promise<ActionResult> {
  const parsed = webhookIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const webhookId = BigInt(parsed.data);
  const gate = await gateForWebhook(webhookId);
  if (!gate.ok) return gate;

  const sentAt = new Date().toISOString();
  await db.execute(sql`
    SELECT graphile_worker.add_job(
      'webhook-dispatch',
      json_build_object(
        'test', true,
        'webhookId', ${webhookId.toString()}::text,
        'sentAt', ${sentAt}::text
      )
    )
  `);

  return { ok: true };
}
