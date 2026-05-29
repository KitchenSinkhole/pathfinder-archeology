import { bigint, bigserial, index, integer, jsonb, pgTable, timestamp } from 'drizzle-orm/pg-core';
import { apCharacter } from './character';
import { structureEventKind } from './enums';

// Stage 17.2. Append-only accountability log for manual structure intel
// (`ap_structure`). Structures are deployment-global and any authenticated user
// may create/edit/delete them, so every mutation is recorded here stamped with
// the acting character — that's how griefers are identified.
//
// Deliberately FK-less on `structure_id` / `system_id`: a `delete` record must
// survive the hard-delete of its `ap_structure` row (the row is gone, but the
// audit trail — including the full pre-delete snapshot in `payload` — must
// remain). Only `character_id` is a real FK, SET NULL on erase, matching the
// audit convention of `ap_map_event` and `ap_structure.created_by_character_id`.
export const apStructureEvent = pgTable(
  'ap_structure_event',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    structureId: bigint('structure_id', { mode: 'bigint' }).notNull(),
    systemId: integer('system_id').notNull(),
    characterId: bigint('character_id', { mode: 'bigint' }).references(() => apCharacter.id, {
      onDelete: 'set null',
    }),
    kind: structureEventKind('kind').notNull(),
    // The values written (create/update) or the full pre-delete row (delete).
    payload: jsonb('payload'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ap_structure_event_structure_id_idx').on(t.structureId),
    index('ap_structure_event_character_id_idx').on(t.characterId),
  ],
);
