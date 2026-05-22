import { bigint, bigserial, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { apCharacter } from './character';
import { apMap } from './map';

// SPEC §6.5 / §11 Q11. The single append-only audit log replacing the legacy
// activity_log + connection_log + NDJSON history files. Every mutation lands as
// exactly one INSERT here; an AFTER INSERT trigger fires
// `pg_notify('map:'||map_id, payload)` to drive realtime fan-out (the WS server
// LISTENs on those channels).
//
// PARTITIONED MONTHLY by `occurred_at` via pg_partman — Drizzle can't emit
// partitioned DDL, so the migration (0004_map_schema.sql) hand-writes the
// `PARTITION BY RANGE` table and the `partman.create_parent` call. This Drizzle
// definition exists only for type inference and FK resolution; the partition
// key must be part of the PK, hence the composite `(id, occurred_at)`.
export const apMapEvent = pgTable(
  'ap_map_event',
  {
    id: bigserial('id', { mode: 'bigint' }),
    mapId: bigint('map_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMap.id, { onDelete: 'cascade' }),
    // SET NULL: erasing a character must not cascade-wipe map history.
    characterId: bigint('character_id', { mode: 'bigint' }).references(() => apCharacter.id, {
      onDelete: 'set null',
    }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    kind: text('kind').notNull(),
    payload: jsonb('payload'),
  },
  (t) => [primaryKey({ columns: [t.id, t.occurredAt] })],
);
