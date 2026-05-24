import { bigint, boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { authzLevel, characterStatus } from './enums';
import { apUser } from './user';

// SPEC §7. ESI tokens live directly on the character row (not a separate auth
// table — the legacy `character_authentication` cookie store is dropped). The
// access/refresh tokens are stored as ciphertext blobs produced by
// `src/lib/crypto.ts`; nothing here ever holds plaintext.
export const apCharacter = pgTable('ap_character', {
  // EVE character id is a natural 64-bit key — not generated.
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => apUser.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // CCP rotates `owner_hash` when a character is transferred between accounts;
  // it is the canonical "same character" signal. SPEC §7.
  ownerHash: text('owner_hash').notNull(),
  // Membership ids. Real FK tables (ap_corporation / ap_alliance) arrive in a
  // later stage; stored as plain nullable bigints until then.
  corporationId: bigint('corporation_id', { mode: 'bigint' }),
  allianceId: bigint('alliance_id', { mode: 'bigint' }),
  // Encrypted at rest (AES-256-GCM, see src/lib/crypto.ts).
  esiAccessToken: text('esi_access_token'),
  esiRefreshToken: text('esi_refresh_token'),
  esiAccessTokenExpires: timestamp('esi_access_token_expires', { withTimezone: true }),
  esiScopes: text('esi_scopes').array(),
  status: characterStatus('status').notNull().default('active'),
  statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
  statusReason: text('status_reason'),
  authzLevel: authzLevel('authz_level').notNull().default('member'),
  // SPEC §5.3 / Stage 12. Last-known state cached on the row by the
  // location-poll job; nullable until the first successful tick. No FK to
  // `universe_system` — a universe rebuild would otherwise have to honour
  // every stale pointer, and the next poll tick overwrites the value anyway.
  lastSystemId: integer('last_system_id'),
  lastShipTypeId: integer('last_ship_type_id'),
  lastOnline: boolean('last_online'),
  lastLocationAt: timestamp('last_location_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
