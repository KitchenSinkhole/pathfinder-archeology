import { z } from 'zod';

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
// Data-bearing load schemas (forward-declared). The event-reference fields are
// firm; the `data` body is a passthrough until Stage 6 replaces it with the
// real ap_map_system / ap_map_connection / ap_map_event row schemas.
// ---------------------------------------------------------------------------

/** Fired after any map-affecting mutation (one per `ap_map_event` insert). */
export const mapUpdateLoadSchema = z.object({
  mapId: z.number().int().positive(),
  eventId: z.number().int().positive().optional(),
  kind: z.string().optional(),
  // tightened in Stage 6: { systems, connections } from the ap_map_* row schemas.
  data: z.unknown().optional(),
});

export const mapConnectionAccessLoadSchema = z.object({
  mapId: z.number().int().positive(),
  // tightened in Stage 6: per-connection access body.
  data: z.unknown().optional(),
});

export const characterUpdateLoadSchema = z.object({
  characterId: z.number().int().positive(),
  // tightened in Stage 6: status/location payload.
  data: z.unknown().optional(),
});

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
