import { pgEnum } from 'drizzle-orm/pg-core';

// SPEC §6.5. The remaining map/connection enums are declared in Stage 6 and
// reuse these two, which `ap_character` (Stage 2) needs at table-create time.

/** Per-character moderation state. Collapses the legacy nullable `kicked`/`banned` timestamps. */
export const characterStatus = pgEnum('character_status', ['active', 'kicked', 'banned']);

/** In-app authority level. Replaces the legacy `role` lookup table. */
export const authzLevel = pgEnum('authz_level', ['member', 'manager', 'admin']);

/** What kinds of systems a map is allowed to hold. SPEC §6.5. */
export const mapScope = pgEnum('map_scope', ['wh', 'k_space', 'none', 'all']);

/** Map ownership/visibility class. */
export const mapType = pgEnum('map_type', ['private', 'corp', 'alliance']);

/** Per-system intel state shown by node colour. */
export const systemStatus = pgEnum('system_status', [
  'unknown',
  'friendly',
  'occupied',
  'hostile',
  'empty',
  'unscanned',
]);

/** What kind of link a connection represents. */
export const connectionScope = pgEnum('connection_scope', [
  'wh',
  'stargate',
  'jumpbridge',
  'abyssal',
]);

/** Wormhole remaining-mass band. Replaces the legacy JSON `massStatus` flag. */
export const whMass = pgEnum('wh_mass', ['fresh', 'reduced', 'critical']);

/** Per-jump mass class of a wormhole (max ship size). Nullable for non-WH links. */
export const whJumpMass = pgEnum('wh_jump_mass', ['s', 'm', 'l', 'xl']);
