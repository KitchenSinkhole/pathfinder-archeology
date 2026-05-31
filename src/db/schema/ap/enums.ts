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

/**
 * Outbound chat channel for `ap_map_webhook`. Stage 14 ships Discord only;
 * adding `'slack'` later is one `ALTER TYPE ap_webhook_channel ADD VALUE` plus
 * a sibling `src/lib/integrations/slack.ts`.
 */
export const apWebhookChannel = pgEnum('ap_webhook_channel', ['discord']);

/**
 * Which event class a webhook subscribes to. `history` mirrors every
 * `ap_map_event` insert on the map; `rally` fires only when a `system.updated`
 * event carries a non-null `rallyAt` (rally set, not cleared).
 */
export const apWebhookEvent = pgEnum('ap_webhook_event', ['history', 'rally']);

/**
 * Stage 15. The six rights a corp may grant its members on `ap_corporation_right`.
 * Names match the legacy `right.name` strings (SPEC §6.5, 09-permissions-and-admin.md).
 * `map_create` is a global capability checked against the actor's corp rights;
 * the remaining five are per-map.
 */
export const mapRight = pgEnum('map_right', [
  'map_create',
  'map_update',
  'map_delete',
  'map_import',
  'map_export',
  'map_share',
]);

/**
 * Scanner-level group of a cosmic signature. The seven keys EVE's in-game
 * probe scanner emits in its "Group" column: six cosmic-site classes plus
 * wormhole. Replaces the prior `ap_map_signature.group_id` FK to
 * `universe_group`, which couldn't represent the cosmic six (only `Wormhole`
 * and `Cosmic Signature` exist in the SDE at group granularity). The actual
 * site name (e.g. "Forgotten Perimeter Habitation Coils") lives in
 * `ap_map_signature.name`; for wormhole sigs `type_id` still resolves to a
 * `universe_wormhole` row.
 */
export const signatureGroupKey = pgEnum('signature_group_key', [
  'combat',
  'relic',
  'data',
  'gas',
  'wormhole',
  'ore',
  'ghost',
]);

/**
 * Stage 15. Where an `ap_role` row originates.
 * - `builtin` — created by the app itself (e.g. seed roles, admin-panel hand-grants).
 * - `corp_title` — mirrored from an EVE corporation title pulled via
 *   `esi-characters.read_titles.v1`; `external_ref` is `'<corporation_id>:<title_id>'`.
 * - `external` — synced from a third-party system (Discord, etc.); `external_ref`
 *   carries the upstream role id.
 */
export const roleSource = pgEnum('role_source', ['builtin', 'corp_title', 'external']);

/**
 * Stage 17.2. The mutation recorded in `ap_structure_event` — the append-only
 * accountability log for manual structure intel. Structures are deployment-global
 * and editable by any authenticated user, so every create/update/delete is
 * stamped with the acting character to identify griefers. (Structures have no
 * `map_id` and therefore cannot live in `ap_map_event`; this is their dedicated,
 * single-source history.)
 */
export const structureEventKind = pgEnum('structure_event_kind', ['create', 'update', 'delete']);

/**
 * Stage 17.10. The auto-tagging scheme a map runs (`ap_map.tag_scheme`).
 * - `none` — no auto-tagging; the `tag` column is manual-only.
 * - `abc` — per-WH-class sequential letters (A, B, C, … per class).
 * - `0121` — positional chain numbering off the map's Home system.
 *
 * Adding a third scheme is additive: one `ALTER TYPE tag_scheme ADD VALUE`, a
 * new strategy module under `src/lib/tagging/`, and one line in
 * `src/lib/tagging/registry.ts`. The existing two schemes are never touched.
 */
export const tagScheme = pgEnum('tag_scheme', ['none', 'abc', '0121']);
