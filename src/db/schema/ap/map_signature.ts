import {
  bigint,
  bigserial,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { universeGroup, universeType } from '../universe/items';
import { apMapConnection } from './map_connection';
import { apMapSystem } from './map_system';

// SPEC §6.5. An in-game scan signature inside a system, optionally bound to the
// connection it resolves to (the wormhole itself). Reaped by the signature-reap
// cron on `expires_at`. Sigs bound to a connection cascade-delete when it
// collapses; unattached sigs (gas/ore/data/relic) survive system invisibility.
export const apMapSignature = pgTable(
  'ap_map_signature',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    mapSystemId: bigint('map_system_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMapSystem.id, { onDelete: 'cascade' }),
    mapConnectionId: bigint('map_connection_id', { mode: 'bigint' }).references(
      () => apMapConnection.id,
      { onDelete: 'cascade' },
    ),
    // In-game 3-char id, e.g. "ABC".
    sigId: text('sig_id').notNull(),
    groupId: integer('group_id').references(() => universeGroup.id, { onDelete: 'set null' }),
    typeId: integer('type_id').references(() => universeType.id, { onDelete: 'set null' }),
    name: text('name'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('ap_map_signature_system_sig_uq').on(t.mapSystemId, t.sigId)],
);
