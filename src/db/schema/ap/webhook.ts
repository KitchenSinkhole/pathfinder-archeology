import {
  bigint,
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { apWebhookChannel, apWebhookEvent } from './enums';
import { apMap } from './map';

// SPEC §5/§6.5 + Stage 14. Normalised replacement for the legacy denormalised
// webhook columns on `map` (`slackWebHookURL`, `discordWebHookURLHistory`, …).
// One row per `(map, channel, event)`: a map opting into both history and rally
// pings on Discord has two rows. Deleting a webhook = deleting the row; no
// `active` flag per CLAUDE.md lifecycle rule.
//
// The failure-tracking columns (`last_status`, `last_error`, `last_attempted_at`,
// `consecutive_failures`) are observability only — they never block the
// underlying map mutation; the Stage 16 admin UI reads them to surface 404s /
// rate-limits and decide whether to auto-disable a noisy webhook.
//
// URLs are stored plaintext (matches legacy behaviour); rotate the channel
// webhook if the DB is compromised.
export const apMapWebhook = pgTable(
  'ap_map_webhook',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    mapId: bigint('map_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMap.id, { onDelete: 'cascade' }),
    channel: apWebhookChannel('channel').notNull(),
    event: apWebhookEvent('event').notNull(),
    url: text('url').notNull(),
    /** Optional Discord username override; null = use the webhook's configured default. */
    username: text('username'),
    /** HTTP status from the most recent dispatch attempt. */
    lastStatus: integer('last_status'),
    /** Truncated error message from the most recent failed attempt. */
    lastError: text('last_error'),
    lastAttemptedAt: timestamp('last_attempted_at', { withTimezone: true }),
    /** Reset to 0 on any successful dispatch; the admin UI uses this to flag stuck webhooks. */
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('ap_map_webhook_map_channel_event_uq').on(t.mapId, t.channel, t.event),
    // `commitMapEvent` queries `EXISTS (… WHERE map_id = $1)` per event to skip
    // enqueueing when no webhook is configured; this index keeps that hot path
    // index-only on the common no-webhook case.
    index('ap_map_webhook_map_id_idx').on(t.mapId),
  ],
);
