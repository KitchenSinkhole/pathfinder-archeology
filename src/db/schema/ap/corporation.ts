import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Stage 15. Minimal corporation row — created on demand by
// `syncCharacterAuthz` whenever a character's `corporation_id` resolves and no
// matching row exists yet. Serves as the FK target for `ap_corporation_right`
// (the per-corp rights matrix) and `ap_role.corporation_id` (corp-title roles).
//
// `name` and `alliance_id` are refreshed each time a character belonging to
// the corp logs in or is resync'd; they are best-effort and may lag behind
// reality between sync ticks. No active/deleted flag — corps that no longer
// exist simply stop being referenced, and the row stays as historical record.
export const apCorporation = pgTable('ap_corporation', {
  // EVE corporation id is the natural 64-bit key — not generated.
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  name: text('name').notNull(),
  // Nullable: NPC corps and unaffiliated player corps have no alliance.
  allianceId: bigint('alliance_id', { mode: 'bigint' }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
});
