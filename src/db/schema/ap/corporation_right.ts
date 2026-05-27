import { bigint, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { apCorporation } from './corporation';
import { authzLevel, mapRight } from './enums';

// Stage 15. Per-corp rights matrix per SPEC §6.5 lines 396–405.
//
// Flattens the legacy three-way `corporation_right(corp, role, right)` join
// onto a two-column key plus a single `min_authz_level` threshold. Reading
// rule: a character with corp X may exercise `right` Y if there exists a row
// `(X, Y)` AND the character's `authz_level` ordinal is `>= min_authz_level`.
//
// `map_create` is checked globally against the actor's own corp's rights
// (i.e. only members of corps that opted into `map_create` can spawn new
// maps). The other five rights are per-map mutations — `canMutateMap` joins
// this table against the target map's `owner_corporation_id` (or the actor's
// corp for corp-scope maps).
export const apCorporationRight = pgTable(
  'ap_corporation_right',
  {
    corporationId: bigint('corporation_id', { mode: 'bigint' })
      .notNull()
      .references(() => apCorporation.id, { onDelete: 'cascade' }),
    right: mapRight('right').notNull(),
    minAuthzLevel: authzLevel('min_authz_level').notNull(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.right], name: 'ap_corporation_right_pk' })],
);
