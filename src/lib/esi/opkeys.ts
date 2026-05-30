/**
 * Canonical opKey → swagger operationId map for the ESI client (Stage 4).
 *
 * "opKey" is Pathfinder's internal name for an ESI operation (e.g.
 * `getCharacterLocation`). Each opKey resolves to a swagger `operationId`
 * (e.g. `get_characters_character_id_location`), and `src/lib/esi/swagger.json`
 * is authoritative for the HTTP method + path + params that operationId names.
 *
 * The opKey inventory is grepped from legacy call sites (docs/spec/05 §3.1).
 * The legacy vendor package (`monoliyoda/pathfinder_esi`) that dispatched
 * opKeys is not vendored here, so a few pairings are inferred from call-site
 * signatures — those carry `inferred: true`. The companion test
 * (`tests/esi/opkeys.test.ts`) asserts every operationId below exists in the
 * checked-in swagger so a typo or drift fails loudly.
 *
 * This module is data only — no request logic. The client is Stage 4.
 */

export interface OpDef {
  /** swagger `operationId` resolving the HTTP method/path/params. */
  operationId: string;
  /** Whether the call requires a character ESI access token. */
  auth: 'none' | 'character';
  /**
   * True when the opKey→operationId pairing could not be confirmed against
   * vendor source and was inferred from call-site signatures (docs/spec/05 Q1).
   * The option-bag request shape for these should be re-confirmed in Stage 4.
   */
  inferred?: true;
}

export const OP_KEYS = {
  // Status
  getStatus: { operationId: 'get_status', auth: 'none' },

  // Character
  getCharacter: { operationId: 'get_characters_character_id', auth: 'none' },
  getCharacterAffiliation: { operationId: 'post_characters_affiliation', auth: 'none' },
  getCharacterRoles: { operationId: 'get_characters_character_id_roles', auth: 'character' },
  getCharacterTitles: { operationId: 'get_characters_character_id_titles', auth: 'character' },
  getCharacterClones: { operationId: 'get_characters_character_id_clones', auth: 'character' },
  getCharacterOnline: { operationId: 'get_characters_character_id_online', auth: 'character' },
  getCharacterLocation: { operationId: 'get_characters_character_id_location', auth: 'character' },
  getCharacterShip: { operationId: 'get_characters_character_id_ship', auth: 'character' },

  // Corporation / Alliance
  getCorporation: { operationId: 'get_corporations_corporation_id', auth: 'none' },
  getCorporationRoles: { operationId: 'get_characters_character_id_roles', auth: 'character' },
  getNpcCorporations: { operationId: 'get_corporations_npccorps', auth: 'none' },
  getAlliance: { operationId: 'get_alliances_alliance_id', auth: 'none' },

  // UI mutations (option-bag arguments — inferred, re-confirm in Stage 4)
  setWaypoint: { operationId: 'post_ui_autopilot_waypoint', auth: 'character', inferred: true },
  openWindow: { operationId: 'post_ui_openwindow_information', auth: 'character', inferred: true },

  // Routing / search
  getRoute: { operationId: 'get_route_origin_destination', auth: 'none', inferred: true },
  search: { operationId: 'get_characters_character_id_search', auth: 'character' },
  getUniverseNames: { operationId: 'post_universe_names', auth: 'none' },

  // Universe — geography
  getUniverseSystems: { operationId: 'get_universe_systems', auth: 'none' },
  getUniverseSystem: { operationId: 'get_universe_systems_system_id', auth: 'none' },
  getUniverseConstellations: { operationId: 'get_universe_constellations', auth: 'none' },
  getUniverseConstellation: { operationId: 'get_universe_constellations_constellation_id', auth: 'none' },
  getUniverseRegions: { operationId: 'get_universe_regions', auth: 'none' },
  getUniverseRegion: { operationId: 'get_universe_regions_region_id', auth: 'none' },
  getUniverseStargate: { operationId: 'get_universe_stargates_stargate_id', auth: 'none' },
  getUniverseStation: { operationId: 'get_universe_stations_station_id', auth: 'none' },
  getUniverseStar: { operationId: 'get_universe_stars_star_id', auth: 'none' },
  getUniversePlanet: { operationId: 'get_universe_planets_planet_id', auth: 'none' },

  // Universe — items / dogma
  getUniverseCategories: { operationId: 'get_universe_categories', auth: 'none' },
  getUniverseCategory: { operationId: 'get_universe_categories_category_id', auth: 'none' },
  getUniverseGroups: { operationId: 'get_universe_groups', auth: 'none' },
  getUniverseGroup: { operationId: 'get_universe_groups_group_id', auth: 'none' },
  getUniverseType: { operationId: 'get_universe_types_type_id', auth: 'none' },
  getDogmaAttribute: { operationId: 'get_dogma_attributes_attribute_id', auth: 'none' },
  getUniverseRace: { operationId: 'get_universe_races', auth: 'none' },
  getUniverseFaction: { operationId: 'get_universe_factions', auth: 'none' },

  // Structures (player citadels)
  getUniverseStructure: { operationId: 'get_universe_structures_structure_id', auth: 'character' },

  // Killmails (zKillboard list entries carry only id + hash; the body is here)
  getKillmail: { operationId: 'get_killmails_killmail_id_killmail_hash', auth: 'none' },

  // Stats / sovereignty (cron-driven)
  getUniverseJumps: { operationId: 'get_universe_system_jumps', auth: 'none' },
  getUniverseKills: { operationId: 'get_universe_system_kills', auth: 'none' },
  getSovereigntyMap: { operationId: 'get_sovereignty_map', auth: 'none' },
  getFactionWarSystems: { operationId: 'get_fw_systems', auth: 'none' },
} as const satisfies Record<string, OpDef>;

export type OpKey = keyof typeof OP_KEYS;
