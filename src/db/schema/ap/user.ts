import { bigint, boolean, integer, pgTable, timestamp } from 'drizzle-orm/pg-core';

// SPEC §9 auth principals: a user owns one or more characters. Stage 2 creates
// one user per newly-seen character; linking additional characters onto an
// existing user is a Stage 5 flow. Kept deliberately minimal — identity lives
// on the character rows.
export const apUser = pgTable('ap_user', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // Stage 17.5: the account's "main" character — the human identity that login
  // lands on and that statistics / activity roll up to. FK to ap_character is
  // declared in migration 0018 (an inline `.references()` here would create a
  // circular schema import: character.ts already imports apUser).
  mainCharacterId: bigint('main_character_id', { mode: 'bigint' }),
  // Per-account toggle for the connection travel animation (a subtle moving dot
  // along a connection when a tracked pilot jumps across it). On by default.
  connectionTravelAnimation: boolean('connection_travel_animation').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
