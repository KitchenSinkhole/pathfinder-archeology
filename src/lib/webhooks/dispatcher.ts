import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  apCharacter,
  apMap,
  apMapConnection,
  apMapEvent,
  apMapSystem,
  apMapWebhook,
  universeSystem,
} from '@/db/schema';
import { postDiscordWebhook, type DiscordWebhookPayload } from '@/lib/integrations/discord';
import { mapEventPayloadSchema, type MapEventPayload } from '@/lib/realtime/protocol';
import {
  formatHistoryMessage,
  formatRallyMessage,
  isRallySetEvent,
  type WebhookEventContext,
} from './formatters';

/**
 * Stage 14. Single-event Discord webhook dispatch. Invoked by the
 * `webhook-dispatch` graphile-worker task (one call per `ap_map_event` insert
 * on a map with at least one `ap_map_webhook` row).
 *
 * Per the rebuild contract ("never block the underlying map mutation"), the
 * dispatcher NEVER throws — every per-webhook outcome is recorded on the
 * `ap_map_webhook` row's status columns and surfaced in the returned notes.
 * No automatic retries: graphile-worker would re-deliver to webhooks that
 * already succeeded, causing duplicate messages. `consecutive_failures`
 * accumulates across events; the Stage 16 admin UI is where auto-disable
 * policy lives.
 */

const LAST_ERROR_MAX = 500;

export interface WebhookDispatchNotes {
  /** Total webhook deliveries actually attempted for this event (formatter returned a payload). */
  attempted: number;
  succeeded: number;
  failed: number;
  /** Configured webhooks that the formatter declined to render (e.g. position-only update). */
  skipped: number;
  /** `true` when the event row could not be found at dispatch time (purged or never existed). */
  missingEvent?: true;
}

export async function runWebhookDispatch(
  mapId: bigint,
  eventId: bigint,
  occurredAt: Date,
): Promise<WebhookDispatchNotes> {
  const [eventRow] = await db
    .select({
      kind: apMapEvent.kind,
      payload: apMapEvent.payload,
      characterId: apMapEvent.characterId,
    })
    .from(apMapEvent)
    .where(
      and(
        eq(apMapEvent.mapId, mapId),
        eq(apMapEvent.id, eventId),
        eq(apMapEvent.occurredAt, occurredAt),
      ),
    );
  if (!eventRow) {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: 0, missingEvent: true };
  }

  const parsed = mapEventPayloadSchema.safeParse(eventRow.payload);
  if (!parsed.success) {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
  }
  const event = parsed.data;

  const ctx = await resolveContext(mapId, event, eventRow.characterId);
  if (!ctx) {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const isRally = isRallySetEvent(event);
  const webhooks = await db
    .select({
      id: apMapWebhook.id,
      channel: apMapWebhook.channel,
      event: apMapWebhook.event,
      url: apMapWebhook.url,
      username: apMapWebhook.username,
    })
    .from(apMapWebhook)
    .where(eq(apMapWebhook.mapId, mapId));

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const wh of webhooks) {
    // Rally webhooks only fire on rally-set events; rally-clear and other
    // system updates flow to history only.
    if (wh.event === 'rally' && !isRally) continue;
    if (wh.channel !== 'discord') continue;

    const payload =
      wh.event === 'rally'
        ? formatRallyMessage(event, ctx)
        : formatHistoryMessage(event, ctx);
    if (!payload) {
      skipped += 1;
      continue;
    }

    attempted += 1;
    if (wh.username) payload.username = wh.username;

    const outcome = await deliver(wh.id, wh.url, payload);
    if (outcome.ok) succeeded += 1;
    else failed += 1;
  }

  return { attempted, succeeded, failed, skipped };
}

async function deliver(
  webhookId: bigint,
  url: string,
  payload: DiscordWebhookPayload,
): Promise<{ ok: boolean }> {
  const result = await postDiscordWebhook(url, payload);
  const attemptedAt = new Date();

  if (result.ok) {
    await db
      .update(apMapWebhook)
      .set({
        lastStatus: result.status,
        lastError: null,
        lastAttemptedAt: attemptedAt,
        consecutiveFailures: 0,
        updatedAt: attemptedAt,
      })
      .where(eq(apMapWebhook.id, webhookId));
    return { ok: true };
  }

  await db
    .update(apMapWebhook)
    .set({
      lastStatus: result.status ?? null,
      lastError: result.error.slice(0, LAST_ERROR_MAX),
      lastAttemptedAt: attemptedAt,
      consecutiveFailures: sql`${apMapWebhook.consecutiveFailures} + 1`,
      updatedAt: attemptedAt,
    })
    .where(eq(apMapWebhook.id, webhookId));
  return { ok: false };
}

async function resolveContext(
  mapId: bigint,
  event: MapEventPayload,
  characterId: bigint | null,
): Promise<WebhookEventContext | null> {
  const [mapRow] = await db.select({ name: apMap.name }).from(apMap).where(eq(apMap.id, mapId));
  if (!mapRow) return null;

  let characterName: string | null = null;
  if (characterId !== null) {
    const [charRow] = await db
      .select({ name: apCharacter.name })
      .from(apCharacter)
      .where(eq(apCharacter.id, characterId));
    characterName = charRow?.name ?? null;
  }

  const refs = await collectSystemRefs(event);
  const systemNamesById = refs.mapSystemIds.length
    ? await loadSystemNames(refs.mapSystemIds)
    : new Map<bigint, string>();

  // `system.added` carries the EVE system name in the payload itself.
  const payloadSystemName = event.kind === 'system.added' ? event.name : null;

  return {
    mapName: mapRow.name,
    characterName,
    systemName:
      payloadSystemName ??
      (refs.primaryMapSystemId
        ? (systemNamesById.get(refs.primaryMapSystemId) ?? null)
        : null),
    sourceSystemName: refs.sourceMapSystemId
      ? (systemNamesById.get(refs.sourceMapSystemId) ?? null)
      : null,
    targetSystemName: refs.targetMapSystemId
      ? (systemNamesById.get(refs.targetMapSystemId) ?? null)
      : null,
  };
}

async function collectSystemRefs(event: MapEventPayload): Promise<{
  primaryMapSystemId: bigint | null;
  sourceMapSystemId: bigint | null;
  targetMapSystemId: bigint | null;
  mapSystemIds: bigint[];
}> {
  let primaryMapSystemId: bigint | null = null;
  let sourceMapSystemId: bigint | null = null;
  let targetMapSystemId: bigint | null = null;

  switch (event.kind) {
    case 'system.added':
    case 'system.removed':
    case 'system.updated':
      primaryMapSystemId = safeBigInt(event.id);
      break;
    case 'connection.create':
      sourceMapSystemId = safeBigInt(event.source);
      targetMapSystemId = safeBigInt(event.target);
      break;
    case 'connection.update': {
      const endpoints = await loadConnectionEndpoints(safeBigInt(event.id));
      sourceMapSystemId = endpoints?.sourceId ?? null;
      targetMapSystemId = endpoints?.targetId ?? null;
      break;
    }
    case 'connection.delete':
      // Connection row is hard-deleted; endpoint names unrecoverable. Formatter
      // falls back to generic phrasing.
      break;
    case 'signature.create':
      primaryMapSystemId = safeBigInt(event.mapSystemId);
      break;
    case 'signature.update':
    case 'signature.delete':
      // Update / delete payloads don't carry `mapSystemId`. Resolving it would
      // require an extra join on `ap_map_signature` (and the row is gone for
      // delete); defer richer signature context to Stage 17's UX sweep.
      break;
    default:
      break;
  }

  return {
    primaryMapSystemId,
    sourceMapSystemId,
    targetMapSystemId,
    mapSystemIds: uniqueBigInts([primaryMapSystemId, sourceMapSystemId, targetMapSystemId]),
  };
}

async function loadSystemNames(mapSystemIds: bigint[]): Promise<Map<bigint, string>> {
  const rows = await db
    .select({
      mapSystemId: apMapSystem.id,
      name: universeSystem.name,
    })
    .from(apMapSystem)
    .innerJoin(universeSystem, eq(apMapSystem.systemId, universeSystem.id))
    .where(inArray(apMapSystem.id, mapSystemIds));
  return new Map(rows.map((r) => [r.mapSystemId, r.name]));
}

async function loadConnectionEndpoints(
  connectionId: bigint | null,
): Promise<{ sourceId: bigint; targetId: bigint } | null> {
  if (connectionId === null) return null;
  const [row] = await db
    .select({
      sourceId: apMapConnection.sourceMapSystemId,
      targetId: apMapConnection.targetMapSystemId,
    })
    .from(apMapConnection)
    .where(eq(apMapConnection.id, connectionId));
  return row ?? null;
}

function uniqueBigInts(input: Array<bigint | null>): bigint[] {
  const out: bigint[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    if (v === null) continue;
    const key = v.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function safeBigInt(str: string | null | undefined): bigint | null {
  if (!str) return null;
  try {
    return BigInt(str);
  } catch {
    return null;
  }
}
