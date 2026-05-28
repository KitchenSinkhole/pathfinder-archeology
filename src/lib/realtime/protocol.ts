import { z } from 'zod';
import {
  connectionScope,
  mapScope,
  mapType,
  systemStatus,
  whJumpMass,
  whMass,
} from '@/db/schema/ap/enums';

/**
 * Wire contracts for the Aperture realtime WebSocket transport.
 *
 * Architecture (SPEC §§5–6, CLAUDE.md "Realtime"): the WebSocket is
 * broadcast-only. A map mutation lands as one `INSERT INTO ap_map_event`; an
 * AFTER INSERT trigger fires `pg_notify('map:'||map_id, …)`; the WS server's
 * Postgres LISTEN handler picks it up and fans the envelope to subscribed
 * sockets. Clients never mutate over the socket — the only client→server
 * messages are `subscribe` / `unsubscribe`.
 *
 * Authorization is session-based (Auth.js). `subscribe` only names the map
 * channels the client wants; the server independently checks the session has
 * access. There is no token handshake on the wire.
 *
 * Fidelity: the envelope and control-plane messages are pinned here. The
 * data-bearing bodies (mapUpdate/characterUpdate/etc.) are intentionally
 * forward-declared and tightened in Stage 6 once the `ap_map_*` row schemas
 * exist — they are derived from the rebuild's operational need, not legacy
 * payload shapes.
 */

// ---------------------------------------------------------------------------
// Task vocabulary (fixed — CLAUDE.md). Do not add task names without updating
// the spec.
// ---------------------------------------------------------------------------

export const SERVER_TO_CLIENT_TASKS = [
  'mapUpdate',
  'mapAccess',
  'mapConnectionAccess',
  'mapDeleted',
  'characterUpdate',
  'characterLogout',
  'healthCheck',
  'logData',
] as const;

export const CLIENT_TO_SERVER_TASKS = ['subscribe', 'unsubscribe'] as const;

export type ServerToClientTask = (typeof SERVER_TO_CLIENT_TASKS)[number];
export type ClientToServerTask = (typeof CLIENT_TO_SERVER_TASKS)[number];

// ---------------------------------------------------------------------------
// Envelope. Every frame is `{ task, load }` (CLAUDE.md wire frame). `load` is
// validated per-task by the discriminated unions below; the raw envelope keeps
// it `unknown` so a malformed frame fails at the task layer with context.
// ---------------------------------------------------------------------------

export const envelopeSchema = z.object({
  task: z.enum([...SERVER_TO_CLIENT_TASKS, ...CLIENT_TO_SERVER_TASKS]),
  load: z.unknown(),
});

export type Envelope = z.infer<typeof envelopeSchema>;

// ---------------------------------------------------------------------------
// Control-plane load schemas (pinned firm).
// ---------------------------------------------------------------------------

/** Client → server. Names the map channels to (un)subscribe; access is checked server-side via the session. */
export const subscribeLoadSchema = z.object({
  mapIds: z.array(z.number().int().positive()),
});

export const unsubscribeLoadSchema = subscribeLoadSchema;

/** Liveness probe. Client sends `{ ts }`; server echoes it back with status. */
export const healthCheckLoadSchema = z.object({
  ts: z.number(),
  ok: z.boolean().optional(),
  listeners: z.number().int().nonnegative().optional(),
});

export const mapDeletedLoadSchema = z.object({
  mapId: z.number().int().positive(),
});

export const characterLogoutLoadSchema = z.object({
  characterIds: z.array(z.number().int().positive()),
});

export const mapAccessLoadSchema = z.object({
  mapId: z.number().int().positive(),
  characterIds: z.array(z.number().int().positive()),
});

// ---------------------------------------------------------------------------
// Map-event payload contract (Stage 9.1). The jsonb `ap_map_event.payload` *is*
// this body: the `tg_map_event_notify` trigger forwards it verbatim and `bus.ts`
// re-wraps it as the `mapUpdate.load.data`. Convention: every payload is
// `{ kind, eventId, ...patch }` — `kind` selects the variant, `eventId` is the
// new `ap_map_event.id` for client-side dedupe, and the patch carries exactly
// what a canvas needs to apply the change without refetching. Timestamps cross
// the wire as ISO strings (jsonb-serialized `Date`s).
// ---------------------------------------------------------------------------

const systemStatusEnum = z.enum(systemStatus.enumValues);
const connectionScopeEnum = z.enum(connectionScope.enumValues);
const whMassEnum = z.enum(whMass.enumValues);
const whJumpMassEnum = z.enum(whJumpMass.enumValues);
const mapScopeEnum = z.enum(mapScope.enumValues);
const mapTypeEnum = z.enum(mapType.enumValues);

const eventId = z.number().int().positive();

/** Full node body — mirrors `MapSystemNode` (loadMap.ts) so a client can append. */
const systemNodeBody = {
  id: z.string(),
  systemId: z.number().int(),
  name: z.string(),
  alias: z.string().nullable(),
  tag: z.string().nullable(),
  status: systemStatusEnum,
  security: z.string().nullable(),
  trueSec: z.number().nullable(),
  effect: z.string().nullable(),
  regionName: z.string(),
  constellationName: z.string(),
  statics: z.array(z.string()),
  locked: z.boolean(),
  positionX: z.number(),
  positionY: z.number(),
};

/** Full edge body — mirrors `MapConnectionEdge` (loadMap.ts). */
const connectionEdgeBody = {
  id: z.string(),
  source: z.string(),
  target: z.string(),
  scope: connectionScopeEnum,
  massStatus: whMassEnum,
  jumpMassClass: whJumpMassEnum.nullable(),
  isEol: z.boolean(),
  isFrigate: z.boolean(),
  preserveMass: z.boolean(),
  isRolling: z.boolean(),
  eolAt: z.string().nullable(),
  createdAt: z.string(),
};

/** Full signature body — mirrors `ap_map_signature` row fields used by the canvas. */
const signatureBody = {
  id: z.string(),
  mapSystemId: z.string(),
  mapConnectionId: z.string().nullable(),
  sigId: z.string(),
  groupId: z.number().int().nullable(),
  typeId: z.number().int().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  expiresAt: z.string(),
};

export const mapEventPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('system.added'), eventId, ...systemNodeBody }),
  z.object({ kind: z.literal('system.removed'), eventId, id: z.string() }),
  z.object({
    kind: z.literal('system.updated'),
    eventId,
    id: z.string(),
    alias: z.string().nullable().optional(),
    tag: z.string().nullable().optional(),
    status: systemStatusEnum.optional(),
    intelNotes: z.string().nullable().optional(),
    locked: z.boolean().optional(),
    rallyAt: z.string().nullable().optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
  }),
  z.object({ kind: z.literal('connection.create'), eventId, ...connectionEdgeBody }),
  z.object({
    kind: z.literal('connection.update'),
    eventId,
    id: z.string(),
    scope: connectionScopeEnum.optional(),
    massStatus: whMassEnum.optional(),
    jumpMassClass: whJumpMassEnum.nullable().optional(),
    isEol: z.boolean().optional(),
    isFrigate: z.boolean().optional(),
    preserveMass: z.boolean().optional(),
    isRolling: z.boolean().optional(),
    eolAt: z.string().nullable().optional(),
  }),
  z.object({ kind: z.literal('connection.delete'), eventId, id: z.string() }),
  z.object({ kind: z.literal('signature.create'), eventId, ...signatureBody }),
  z.object({
    kind: z.literal('signature.update'),
    eventId,
    id: z.string(),
    mapConnectionId: z.string().nullable().optional(),
    sigId: z.string().optional(),
    groupId: z.number().int().nullable().optional(),
    typeId: z.number().int().nullable().optional(),
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    expiresAt: z.string().optional(),
  }),
  z.object({ kind: z.literal('signature.delete'), eventId, id: z.string() }),
  z.object({
    kind: z.literal('map.create'),
    eventId,
    id: z.string(),
    name: z.string(),
    scope: mapScopeEnum,
    type: mapTypeEnum,
    icon: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('map.update'),
    eventId,
    id: z.string(),
    name: z.string().optional(),
    icon: z.string().nullable().optional(),
    deleteExpiredConnections: z.boolean().optional(),
    deleteEolConnections: z.boolean().optional(),
    trackAbyssalJumps: z.boolean().optional(),
    logActivity: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('map.delete'),
    eventId,
    id: z.string(),
    deletedAt: z.string().nullable().optional(),
  }),
  // Stage 16.2: admin clears `ap_map.deleted_at` (un-soft-deletes).
  z.object({ kind: z.literal('map.restore'), eventId, id: z.string() }),
  // Stage 16.2: admin hard-deletes a soft-deleted map immediately (skips the
  // 30-day map-purge cron grace). Emitted inside the same transaction as the
  // row delete, BEFORE the DELETE; pg_notify buffers the notification until
  // COMMIT, so subscribers receive it even though the source event row is
  // cascaded out by the parent DELETE.
  z.object({ kind: z.literal('map.purge'), eventId, id: z.string() }),
]);

export type MapEventPayload = z.infer<typeof mapEventPayloadSchema>;

/**
 * Seeded `ap_event_kind` values (migrations 0004 + 0014). The discriminator set.
 * Stage 16.2 added `map.restore` and `map.purge` for the admin maps panel.
 */
export const MAP_EVENT_KINDS = [
  'system.added',
  'system.removed',
  'system.updated',
  'connection.create',
  'connection.update',
  'connection.delete',
  'signature.create',
  'signature.update',
  'signature.delete',
  'map.create',
  'map.update',
  'map.delete',
  'map.restore',
  'map.purge',
] as const;

export type MapEventKind = (typeof MAP_EVENT_KINDS)[number];

/** Patch fields for a given kind — the body `mutate()` returns, minus `kind`/`eventId`. */
export type MapEventPatch<K extends MapEventKind> = Omit<
  Extract<MapEventPayload, { kind: K }>,
  'kind' | 'eventId'
>;

// ---------------------------------------------------------------------------
// Data-bearing load schemas. `mapUpdate` carries the event payload above; the
// rest are forward-declared (tightened in later stages).
// ---------------------------------------------------------------------------

/** Fired after any map-affecting mutation (one per `ap_map_event` insert). */
export const mapUpdateLoadSchema = z.object({
  mapId: z.number().int().positive(),
  kind: z.string().optional(),
  data: mapEventPayloadSchema.optional(),
});

export const mapConnectionAccessLoadSchema = z.object({
  mapId: z.number().int().positive(),
  // tightened in Stage 6: per-connection access body.
  data: z.unknown().optional(),
});

/**
 * `characterUpdate` envelope load. Emitted by the Stage 12 location-poll on
 * every tick that changes the character's persisted state — broadcast on the
 * same `map:<id>` LISTEN channels as `mapUpdate` (one notification per tracked
 * map). The bus discriminates by the `task` discriminator in the pg_notify
 * payload (see `src/lib/realtime/bus.ts`).
 *
 * `systemId` and `shipTypeId` are nullable because the poll persists the last
 * known values; before the first successful online tick (or while offline)
 * either may be `null`. `online` is `null` between the very first enqueue and
 * the first completed tick.
 *
 * `characterName` rides every envelope so the client never needs a roster
 * lookup to render the breadcrumb. `shipTypeName` is the resolved `universe_type.name`
 * for `shipTypeId` — null when `shipTypeId` is null or the row is missing.
 * The envelope stays self-contained per the payload philosophy (see the
 * mapEventPayloadSchema preamble above) at the cost of one tiny universe_type
 * lookup per poll tick.
 *
 * Numbers ride the wire (JSON has no `bigint`); the EVE character id and
 * solar-system id both fit comfortably in `number.MAX_SAFE_INTEGER`.
 */
export const characterUpdateLoadSchema = z.object({
  characterId: z.number().int().positive(),
  characterName: z.string(),
  online: z.boolean().nullable(),
  systemId: z.number().int().nullable(),
  shipTypeId: z.number().int().nullable(),
  shipTypeName: z.string().nullable(),
  locationAt: z.string().nullable(),
});

export type CharacterUpdateLoad = z.infer<typeof characterUpdateLoadSchema>;

export const logDataLoadSchema = z.object({
  mapId: z.number().int().positive(),
  // tightened in Stage 6/10: the ap_map_event history record.
  data: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// Messages (envelope + typed load), as discriminated unions on `task`.
// ---------------------------------------------------------------------------

function message<T extends string, L extends z.ZodTypeAny>(task: T, load: L) {
  return z.object({ task: z.literal(task), load });
}

export const serverToClientMessageSchema = z.discriminatedUnion('task', [
  message('mapUpdate', mapUpdateLoadSchema),
  message('mapAccess', mapAccessLoadSchema),
  message('mapConnectionAccess', mapConnectionAccessLoadSchema),
  message('mapDeleted', mapDeletedLoadSchema),
  message('characterUpdate', characterUpdateLoadSchema),
  message('characterLogout', characterLogoutLoadSchema),
  message('healthCheck', healthCheckLoadSchema),
  message('logData', logDataLoadSchema),
]);

export const clientToServerMessageSchema = z.discriminatedUnion('task', [
  message('subscribe', subscribeLoadSchema),
  message('unsubscribe', unsubscribeLoadSchema),
]);

export type ServerToClientMessage = z.infer<typeof serverToClientMessageSchema>;
export type ClientToServerMessage = z.infer<typeof clientToServerMessageSchema>;
