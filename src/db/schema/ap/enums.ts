import { pgEnum } from 'drizzle-orm/pg-core';

// SPEC §6.5. The remaining map/connection enums are declared in Stage 6 and
// reuse these two, which `ap_character` (Stage 2) needs at table-create time.

/** Per-character moderation state. Collapses the legacy nullable `kicked`/`banned` timestamps. */
export const characterStatus = pgEnum('character_status', ['active', 'kicked', 'banned']);

/** In-app authority level. Replaces the legacy `role` lookup table. */
export const authzLevel = pgEnum('authz_level', ['member', 'manager', 'admin']);
