import {
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';

export const universeRegion = pgTable('universe_region', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
});

export const universeConstellation = pgTable('universe_constellation', {
  id: integer('id').primaryKey(),
  regionId: integer('region_id')
    .notNull()
    .references(() => universeRegion.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  x: doublePrecision('x'),
  y: doublePrecision('y'),
  z: doublePrecision('z'),
});

export const universeSystem = pgTable('universe_system', {
  id: integer('id').primaryKey(),
  constellationId: integer('constellation_id')
    .notNull()
    .references(() => universeConstellation.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  security: text('security'),
  trueSec: doublePrecision('true_sec'),
  securityStatus: doublePrecision('security_status'),
  securityClass: text('security_class'),
  effect: text('effect'),
  x: doublePrecision('x'),
  y: doublePrecision('y'),
  z: doublePrecision('z'),
});

export const universeStargateEdge = pgTable(
  'universe_stargate_edge',
  {
    fromSystemId: integer('from_system_id')
      .notNull()
      .references(() => universeSystem.id, { onDelete: 'cascade' }),
    toSystemId: integer('to_system_id')
      .notNull()
      .references(() => universeSystem.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.fromSystemId, t.toSystemId] }),
    index('universe_stargate_edge_to_idx').on(t.toSystemId),
  ],
);
