import { doublePrecision, integer, pgView } from 'drizzle-orm/pg-core';

/**
 * Typing-only handle for the `universe_type_attribute_effective` view.
 * The view's DDL lives in a custom migration (drizzle-kit `--custom`);
 * `.existing()` tells Drizzle Kit not to emit CREATE/DROP for it.
 *
 * Resolves `COALESCE(override.value, type_attribute.value)` per type/attr,
 * so wormhole dogma reads (e.g. attr 3974) transparently honor overrides.
 */
export const universeTypeAttributeEffective = pgView('universe_type_attribute_effective', {
  typeId: integer('type_id').notNull(),
  attrId: integer('attr_id').notNull(),
  value: doublePrecision('value'),
}).existing();
