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
  // Stage 15. Set on a `kicked` row to the moment the timeout expires; the
  // `character-cleanup` cron flips `status` back to `'active'` and clears this
  // when `now() >= status_expires_at`. NULL for `'active'` and `'banned'` rows
  // (bans are permanent).
  statusExpiresAt: timestamp('status_expires_at', { withTimezone: true }),
  authzLevel: authzLevel('authz_level').notNull().default('member'),
  // Stage 15. When `syncCharacterAuthz` last reconciled this row's
  // `authz_level`, `corporation_id`, `alliance_id`, and `ap_character_role`
  // membership against ESI. Used by the `character-cleanup` job to throttle
  // resync work to stale rows only.
  authzSyncedAt: timestamp('authz_synced_at', { withTimezone: true }),
  // SPEC §5.3 / Stage 12. Last-known state cached on the row by the
  // location-poll job; nullable until the first successful tick. No FK to
  // `universe_system` — a universe rebuild would otherwise have to honour
  // every stale pointer, and the next poll tick overwrites the value anyway.
  lastSystemId: integer('last_system_id'),
  lastShipTypeId: integer('last_ship_type_id'),
  // The pilot's custom ship name (ESI `getCharacterShip.ship_name`) — what the
  // player named this particular hull, distinct from its type. Surfaced in the
  // presence hover panel alongside the resolved type name.
  lastShipName: text('last_ship_name'),
  lastOnline: boolean('last_online'),
  lastLocationAt: timestamp('last_location_at', { withTimezone: true }),
  // Stage 17.5 follow-up. Per-character opt-out for server-side location
  // tracking. Default true — a character is tracked the moment it is linked
  // (first EVE SSO); users disable individual characters from the header
  // Characters panel. A disabled character is polled for nobody and folds onto
  // no map. The location-poll handler gates on this as defense in depth.
  trackingEnabled: boolean('tracking_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
