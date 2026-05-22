import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { universeSystem } from '../universe/geography';
import { systemStatus } from './enums';
import { apMap } from './map';

// SPEC §6.5. A node on a map referencing the static `universe_system`. The
// `visible` flag controls display without deleting history: removing a system
// flips `visible = false` and stamps `last_visible_at`; re-adding it upserts
// `visible = true` while prior intel/tags/status persist. `MAX_SYSTEMS` counts
// only `visible = true` rows.
export const apMapSystem = pgTable(
  'ap_map_system',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    mapId: bigint('map_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMap.id, { onDelete: 'cascade' }),
    // RESTRICT: a static system in use on a map must not be deletable.
    systemId: integer('system_id')
      .notNull()
      .references(() => universeSystem.id, { onDelete: 'restrict' }),
    visible: boolean('visible').notNull(),
    positionX: doublePrecision('position_x').notNull().default(0),
    positionY: doublePrecision('position_y').notNull().default(0),
    alias: text('alias'),
    tag: text('tag'),
    status: systemStatus('status').notNull().default('unknown'),
    intelNotes: text('intel_notes'),
    locked: boolean('locked').notNull().default(false),
    // Non-null ⇒ a rally point is active.
    rallyAt: timestamp('rally_at', { withTimezone: true }),
    firstAddedAt: timestamp('first_added_at', { withTimezone: true }).notNull().defaultNow(),
    lastVisibleAt: timestamp('last_visible_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ap_map_system_map_system_uq').on(t.mapId, t.systemId)],
);
