import { bigint, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { universeSystem } from './geography';

// Mutable ESI-fed sovereignty state used by the read-side intel module. Unlike
// the legacy dual-DB model, this lives beside the static universe tables and is
// refreshed by the `sov-fw-refresh` graphile-worker task.
export const universeSovereigntyMap = pgTable('universe_sovereignty_map', {
  systemId: integer('system_id')
    .primaryKey()
    .references(() => universeSystem.id, { onDelete: 'cascade' }),
  factionId: bigint('faction_id', { mode: 'bigint' }),
  allianceId: bigint('alliance_id', { mode: 'bigint' }),
  corporationId: bigint('corporation_id', { mode: 'bigint' }),
});

// Faction warfare occupancy for low-sec systems. CCP returns `contested` as a
// string status, so keep it as text instead of forcing a boolean state.
export const universeFactionWarSystem = pgTable(
  'universe_faction_war_system',
  {
    systemId: integer('system_id')
      .notNull()
      .references(() => universeSystem.id, { onDelete: 'cascade' }),
    ownerFactionId: bigint('owner_faction_id', { mode: 'bigint' }),
    occupierFactionId: bigint('occupier_faction_id', { mode: 'bigint' }),
    contested: text('contested'),
    victoryPoints: integer('victory_points'),
    victoryPointsThreshold: integer('victory_points_threshold'),
  },
  (t) => [primaryKey({ columns: [t.systemId] })],
);
