import { boolean, doublePrecision, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const universeCategory = pgTable('universe_category', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  published: boolean('published'),
});

export const universeGroup = pgTable('universe_group', {
  id: integer('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => universeCategory.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  published: boolean('published'),
});

export const universeType = pgTable('universe_type', {
  id: integer('id').primaryKey(),
  groupId: integer('group_id')
    .notNull()
    .references(() => universeGroup.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  mass: doublePrecision('mass'),
  volume: doublePrecision('volume'),
  capacity: doublePrecision('capacity'),
  radius: doublePrecision('radius'),
  packagedVolume: doublePrecision('packaged_volume'),
  portionSize: integer('portion_size'),
  marketGroupId: integer('market_group_id'),
  graphicId: integer('graphic_id'),
  published: boolean('published'),
});
