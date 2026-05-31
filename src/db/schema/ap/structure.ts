import {
  bigint,
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { universeSystem } from '../universe/geography';
import { universeType } from '../universe/items';
import { universeCorporation } from '../universe/corporation';
import { apCharacter } from './character';

// SPEC §10 row 9 / spec-08 `system_intel`. Manual structure-intel: one row per
// player-owned structure a user has spotted in a system. System-scoped and
// deployment-global (shared across maps, like the legacy system_intel module).
//
// This is MANUAL ENTRY, not ESI-resolved. ESI's getUniverseStructure only
// returns structures the calling character can dock at (their own corp's), so
// it can never supply intel on other corps' structures — which is the whole
// point of the feature. The structure *type* is static SDE data and therefore
// a real FK; the structure identity/owner are user-supplied notes.
//
// `owner_corporation_id` is the EVE corporation picked from the ESI search in the
// add/edit dialog, FK → `universe_corporation` (the corp name cache) so the owner
// resolves to a real corp and its name has a single source of truth (the cache
// row). It deliberately does NOT point at `ap_corporation`: that table is limited
// to *member* corps for the rights matrix, and a structure owner is usually a
// corp no member belongs to. Null when the owner is unknown.
export const apStructure = pgTable(
  'ap_structure',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    systemId: integer('system_id')
      .notNull()
      .references(() => universeSystem.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    structureTypeId: integer('structure_type_id')
      .notNull()
      .references(() => universeType.id, { onDelete: 'restrict' }),
    ownerCorporationId: bigint('owner_corporation_id', { mode: 'bigint' }).references(
      () => universeCorporation.id,
      { onDelete: 'restrict' },
    ),
    notes: text('notes'),
    // Audit only — erasing a character must not cascade-wipe gathered intel.
    createdByCharacterId: bigint('created_by_character_id', { mode: 'bigint' }).references(
      () => apCharacter.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ap_structure_system_id_idx').on(t.systemId)],
);
