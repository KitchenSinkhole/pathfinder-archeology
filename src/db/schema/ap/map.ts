import { sql } from 'drizzle-orm';
import { bigserial, boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { mapScope, mapType } from './enums';

// SPEC §6.5. The owning entity for every per-map relation. Two-phase deletion
// via `deleted_at` (30-day grace, then a cron hard-purge) — no `active` boolean.
// Legacy per-map toggles `persistentAliases`/`persistentSignatures`/`logHistory`
// are dropped; webhook columns normalise into `ap_map_webhook` (later stage).
export const apMap = pgTable('ap_map', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  scope: mapScope('scope').notNull(),
  type: mapType('type').notNull(),
  name: text('name').notNull(),
  icon: text('icon'),
  deleteExpiredConnections: boolean('delete_expired_connections').notNull().default(true),
  deleteEolConnections: boolean('delete_eol_connections').notNull().default(true),
  trackAbyssalJumps: boolean('track_abyssal_jumps').notNull().default(true),
  logActivity: boolean('log_activity').notNull().default(true),
  nextBookmarks: jsonb('next_bookmarks')
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // NULL = active; non-null = soft-deleted, awaiting hard purge.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
