import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core';

// SPEC §9 auth principals: a user owns one or more characters. Stage 2 creates
// one user per newly-seen character; linking additional characters onto an
// existing user is a Stage 5 flow. Kept deliberately minimal — identity lives
// on the character rows.
export const apUser = pgTable('ap_user', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
