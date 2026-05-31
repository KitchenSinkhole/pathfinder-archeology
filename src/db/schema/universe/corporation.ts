import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// ESI-fed corporation name cache. Populated on demand when the structure-intel
// owner search resolves corp ids → names (`getUniverseNames`), so repeat lookups
// of the same corp serve from here instead of re-hitting ESI. Mutable reference
// data living beside the static universe tables, same pattern as
// `universe_sovereignty_map`.
//
// NOT the same as `ap_corporation`: that table holds *member* corps (created by
// `syncCharacterAuthz`) and is the FK target for the rights matrix, so it must
// stay limited to corps the deployment actually belongs to. This cache holds any
// corp a user has searched for, and is the FK target for `ap_structure.owner_corporation_id`.
export const universeCorporation = pgTable('universe_corporation', {
  // EVE corporation id is the natural 64-bit key — not generated.
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  name: text('name').notNull(),
  // Drives opportunistic re-resolution during search (names are stable but not
  // immutable — corps can rename).
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }).notNull().defaultNow(),
});
