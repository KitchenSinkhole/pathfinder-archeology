import { bigint, integer, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { apMap } from './map';
import { apUser } from './user';

// Per-(map, account) "have we auto-seeded tracking here yet?" marker
// (per-map-character-tracking plan, Stage 1). With the global
// `ap_character.tracking_enabled` flag gone and presence in
// `ap_map_character_tracking` meaning "tracked", an empty selection is
// ambiguous: a never-configured map (should auto-add all the account's active
// characters) vs. a map where the user deliberately deselected everyone (must
// stay empty). This marker disambiguates: the first `subscribe` to a map with
// no seed row inserts the marker AND seeds a tracking row per active character;
// every later open sees the marker and never auto-adds again.
//
// Cascade behavior mirrors the tracking table: deleting the map or the account
// removes the marker.
export const apMapTrackingSeed = pgTable(
  'ap_map_tracking_seed',
  {
    mapId: bigint('map_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMap.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => apUser.id, { onDelete: 'cascade' }),
    seededAt: timestamp('seeded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mapId, t.userId] })],
);
