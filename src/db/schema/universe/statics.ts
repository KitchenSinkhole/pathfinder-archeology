import { integer, pgTable, primaryKey } from 'drizzle-orm/pg-core';
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
