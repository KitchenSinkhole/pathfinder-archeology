import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { universeSystem } from './geography';
import { universeType } from './items';

export const universeSystemStatic = pgTable(
  'universe_system_static',
  {
    systemId: integer('system_id')
      .notNull()
      .references(() => universeSystem.id, { onDelete: 'cascade' }),
    typeId: integer('type_id')
      .notNull()
      .references(() => universeType.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.systemId, t.typeId] })],
);

// Community-compounded wormhole routing catalog (anoik.is /wormholes). The
// source/target class labels are absent from the SDE and ESI; mass, lifetime,
// and scan strength stay dogma-sourced via universe_type_attribute_effective.
// K162 is the universal reverse-exit: null source = appears anywhere, null
// target = resolved from the far side.
export const universeWormhole = pgTable('universe_wormhole', {
  typeId: integer('type_id')
    .primaryKey()
    .references(() => universeType.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sourceClass: text('source_class'),
  targetClass: text('target_class'),
});
