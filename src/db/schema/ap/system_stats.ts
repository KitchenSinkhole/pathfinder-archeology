import { integer, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { universeSystem } from '../universe/geography';

// SPEC §6.5. Narrow per-system stats time-series replacing the legacy
// system_jumps / system_kills_* 24-column circular buffers. One row per
// (system, hour); rolling 24h windows are `WHERE hour_bucket > now() - interval
// '24 hours'`.
//
// PARTITIONED DAILY by `hour_bucket` via pg_partman — Drizzle can't emit
// partitioned DDL, so the migration (0005_system_stats.sql) hand-writes the
// `PARTITION BY RANGE` table and the `partman.create_parent` call. This Drizzle
// definition exists only for type inference; the partition key must be part of
// the PK, hence the composite `(system_id, hour_bucket)`.
//
// Populated by the Stage 11 stats-refresh job — empty until then; the read-only
// kill-stats module renders a zero state against an empty table.
export const apSystemStats = pgTable(
  'ap_system_stats',
  {
    systemId: integer('system_id')
      .notNull()
      .references(() => universeSystem.id, { onDelete: 'cascade' }),
    hourBucket: timestamp('hour_bucket', { withTimezone: true }).notNull(),
    jumps: integer('jumps').notNull().default(0),
    shipKills: integer('ship_kills').notNull().default(0),
    podKills: integer('pod_kills').notNull().default(0),
    factionKills: integer('faction_kills').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.systemId, t.hourBucket] })],
);
