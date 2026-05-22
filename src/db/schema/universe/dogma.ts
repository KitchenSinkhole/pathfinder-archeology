import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { universeType } from './items';

export const universeDogmaAttribute = pgTable('universe_dogma_attribute', {
  id: integer('id').primaryKey(),
  name: text('name'),
  displayName: text('display_name'),
  description: text('description'),
  published: boolean('published'),
  stackable: boolean('stackable'),
  highIsGood: boolean('high_is_good'),
  defaultValue: doublePrecision('default_value'),
  iconId: integer('icon_id'),
  unitId: integer('unit_id'),
});

export const universeTypeAttribute = pgTable(
  'universe_type_attribute',
  {
    typeId: integer('type_id')
      .notNull()
      .references(() => universeType.id, { onDelete: 'cascade' }),
    attributeId: integer('attribute_id')
      .notNull()
      .references(() => universeDogmaAttribute.id, { onDelete: 'cascade' }),
    value: doublePrecision('value'),
  },
  (t) => [primaryKey({ columns: [t.typeId, t.attributeId] })],
);

export const universeTypeOverride = pgTable(
  'universe_type_override',
  {
    typeId: integer('type_id')
      .notNull()
      .references(() => universeType.id, { onDelete: 'cascade' }),
    attrId: integer('attr_id').notNull(),
    value: doublePrecision('value').notNull(),
    reason: text('reason'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.typeId, t.attrId] })],
);
