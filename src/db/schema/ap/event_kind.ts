import { pgTable, text } from 'drizzle-orm/pg-core';

// SPEC §6.5. Stable catalog of `ap_map_event.kind` values, grouped by category
// for admin-UI history filtering — keeps the kind vocabulary out of app code.
// Seed rows are inserted by the Stage 6 migration.
export const apEventKind = pgTable('ap_event_kind', {
  kind: text('kind').primaryKey(),
  category: text('category').notNull(),
});
