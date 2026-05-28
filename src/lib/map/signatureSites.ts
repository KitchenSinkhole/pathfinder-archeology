import type { CosmicSignatureGroupKey } from '@/types';

/**
 * Static catalog of cosmic-signature **site names** by system class and group,
 * the single source of truth for the Type-field auto-suggest in the signature
 * panel. The six cosmic groups (Combat/Relic/Data/Gas/Ore/Ghost) have no SDE
 * rows — their site names are baked into the EVE client — so they can't be
 * DB-resolved; this hand-maintained list is the only place they exist.
 *
 * Ported from the legacy Pathfinder `signature_type.js`. CCP changes these
 * sites roughly twice a year; **to update, edit this file and redeploy** (no
 * migration, no ingest, no DB). The Wormhole group is intentionally absent —
 * wormhole types are DB-backed via `wormholeTypesForSystem` / `WormholeTypeSelect`.
 *
 * Keyed by the `universe_system.security` label (`MapSystemNode.security`),
 * which already encodes class: `C1`–`C6`, `C12` (Thera), `C13` (Shattered),
 * `C14`–`C18` (Drifter Sentinel/Barbican/Vidette/Conflux/Redoubt), and the
 * k-space bands `H` / `L` / `0.0` / `P`. Suggestions are only provided where
 * the legacy data did; everything else falls back to free text.
 *
 * Names marked in-game-verified in the legacy source are kept verbatim.
 */

// Combat sites ===============================================================
const C1_COMBAT = [
  'Perimeter Ambush Point',
  'Perimeter Camp',
  'Phase Catalyst Node',
  'The Line',
] as const;
const C2_COMBAT = [
  'Perimeter Checkpoint',
  'Perimeter Hangar',
  'The Ruins of Enclave Cohort 27',
  'Sleeper Data Sanctuary',
] as const;
const C3_COMBAT = [
  'Fortification Frontier Stronghold',
  'Outpost Frontier Stronghold',
  'Solar Cell',
  'The Oruze Construct',
] as const;
const C4_COMBAT = [
  'Frontier Barracks',
  'Frontier Command Post',
  'Integrated Terminus',
  'Sleeper Information Sanctum',
] as const;
const C5_COMBAT = [
  'Core Garrison',
  'Core Stronghold',
  'Oruze Osobnyk',
  'Quarantine Area',
] as const;
const C6_COMBAT = [
  'Core Citadel',
  'Core Bastion',
  'Strange Energy Readings',
  'The Mirror',
] as const;
const C12_COMBAT = [
  'Epicenter',
  'Expedition Command Outpost Wreck',
  'Planetary Colonization Office Wreck',
  'Testing Facilities',
] as const;
const C14_COMBAT = [
  'Monolith',
  'Wormhole in Rock Circle',
  'Opposing Spatial Rifts',
  'Sleeper Enclave Debris',
  'Crystal Resource',
] as const;
const C15_COMBAT = [
  'Wrecked Ships',
  'Unstable Wormhole',
  'Spatial Rift',
  'Heavily Guarded Spatial Rift',
  'Crystals',
] as const;
const C16_COMBAT = [
  'Ship Graveyard',
  'Sleeper Engineering Station',
  'Spatial Rift',
  'Sleeper Enclave in Coral Rock',
  'Crystals and Stone Circle',
] as const;
const C17_COMBAT = [
  'Monolith',
  'Caged Wormhole',
  'Rock Formation and Wormhole',
  'Particle Acceleration Array',
  'Guarded Asteroid Station',
] as const;
const C18_COMBAT = [
  'Ship Graveyard',
  'Caged Wormhole',
  'Spatial Rift Generator',
  'Sleeper Enclave',
  'Hollow Asteroid',
] as const;

// Relic sites ================================================================
// NullSec relic sites, which also spawn in C1/C2/C3 wormholes.
const NULL_RELIC = [
  'Ruined Angel Crystal Quarry',
  'Ruined Angel Monument Site',
  'Ruined Angel Science Outpost',
  'Ruined Angel Temple Site',
  'Ruined Blood Raider Crystal Quarry',
  'Ruined Blood Raider Monument Site',
  'Ruined Blood Raider Science Outpost',
  'Ruined Blood Raider Temple Site',
  'Ruined Guristas Crystal Quarry',
  'Ruined Guristas Monument Site',
  'Ruined Guristas Science Outpost',
  'Ruined Guristas Temple Site',
  'Ruined Sansha Crystal Quarry',
  'Ruined Sansha Monument Site',
  'Ruined Sansha Science Outpost',
  'Ruined Sansha Temple Site',
  'Ruined Serpentis Crystal Quarry',
  'Ruined Serpentis Monument Site',
  'Ruined Serpentis Science Outpost',
  'Ruined Serpentis Temple Site',
] as const;
const C1_RELIC = [
  'Forgotten Perimeter Coronation Platform',
  'Forgotten Perimeter Power Array',
  ...NULL_RELIC,
] as const;
const C2_RELIC = [
  'Forgotten Perimeter Gateway',
  'Forgotten Perimeter Habitation Coils',
  ...NULL_RELIC,
] as const;
const C3_RELIC = [
  'Forgotten Frontier Quarantine Outpost',
  'Forgotten Frontier Recursive Depot',
  ...NULL_RELIC,
] as const;
const C4_RELIC = [
  'Forgotten Frontier Conversion Module',
  'Forgotten Frontier Evacuation Center',
] as const;
const C5_RELIC = ['Forgotten Core Data Field', 'Forgotten Core Information Pen'] as const;
const C6_RELIC = [
  'Forgotten Core Assembly Hall',
  'Forgotten Core Circuitry Disassembler',
] as const;

// Data sites =================================================================
// NullSec data sites, which also spawn in C1/C2/C3 wormholes.
const NULL_DATA = [
  'Abandoned Research Complex DA005',
  'Abandoned Research Complex DA015',
  'Abandoned Research Complex DC007',
  'Abandoned Research Complex DC021',
  'Abandoned Research Complex DC035',
  'Abandoned Research Complex DG003',
  'Central Angel Command Center',
  'Central Angel Data Mining Site',
  'Central Angel Sparking Transmitter',
  'Central Angel Survey Site',
  'Central Blood Raider Command Center',
  'Central Blood Raider Data Mining Site',
  'Central Blood Raider Sparking Transmitter',
  'Central Blood Raider Survey Site',
  'Central Guristas Command Center',
  'Central Guristas Data Mining Site',
  'Central Guristas Sparking Transmitter',
  'Central Guristas Survey Site',
  'Central Sansha Command Center',
  'Central Sansha Data Mining Site',
  'Central Sansha Sparking Transmitter',
  'Central Sansha Survey Site',
  'Central Serpentis Command Center',
  'Central Serpentis Data Mining Site',
  'Central Serpentis Sparking Transmitter',
  'Central Serpentis Survey Site',
] as const;
const C1_DATA = [
  'Unsecured Perimeter Amplifier',
  'Unsecured Perimeter Information Center',
  ...NULL_DATA,
] as const;
const C2_DATA = [
  'Unsecured Perimeter Comms Relay',
  'Unsecured Perimeter Transponder Farm',
  ...NULL_DATA,
] as const;
const C3_DATA = [
  'Unsecured Frontier Database',
  'Unsecured Frontier Receiver',
  ...NULL_DATA,
] as const;
const C4_DATA = ['Unsecured Frontier Digital Nexus', 'Unsecured Frontier Trinary Hub'] as const;
const C5_DATA = ['Unsecured Frontier Enclave Relay', 'Unsecured Frontier Server Bank'] as const;
const C6_DATA = ['Unsecured Core Backup Array', 'Unsecured Core Emergence'] as const;

// Ghost sites ================================================================
const HS_GHOST = [
  'Lesser Serpentis Covert Research Facility',
  'Lesser Sansha Covert Research Facility',
  'Lesser Guristas Covert Research Facility',
  'Lesser Blood Raiders Covert Research Facility',
] as const;
const LS_GHOST = [
  'Standard Serpentis Covert Research Facility',
  'Standard Sansha Covert Research Facility',
  'Standard Guristas Covert Research Facility',
  'Standard Blood Raiders Covert Research Facility',
] as const;
const NS_GHOST = [
  'Improved Serpentis Covert Research Facility',
  'Improved Sansha Covert Research Facility',
  'Improved Guristas Covert Research Facility',
  'Improved Blood Raiders Covert Research Facility',
] as const;
const WH_GHOST = [
  'Superior Serpentis Covert Research Facility',
  'Superior Sansha Covert Research Facility',
  'Superior Guristas Covert Research Facility',
  'Superior Blood Raiders Covert Research Facility',
] as const;

// Gas sites ==================================================================
const C1_GAS = [
  'Barren Perimeter Reservoir',
  'Token Perimeter Reservoir',
  'Minor Perimeter Reservoir',
  'Sizeable Perimeter Reservoir',
  'Ordinary Perimeter Reservoir',
] as const;
const C2_GAS = C1_GAS;
const C3_GAS = [
  ...C1_GAS,
  'Bountiful Frontier Reservoir',
  'Vast Frontier Reservoir',
] as const;
const C4_GAS = [
  ...C1_GAS,
  'Vast Frontier Reservoir',
  'Bountiful Frontier Reservoir',
] as const;
const C5_GAS = [
  'Barren Perimeter Reservoir',
  'Minor Perimeter Reservoir',
  'Ordinary Perimeter Reservoir',
  'Sizeable Perimeter Reservoir',
  'Token Perimeter Reservoir',
  'Bountiful Frontier Reservoir',
  'Vast Frontier Reservoir',
  'Instrumental Core Reservoir',
  'Vital Core Reservoir',
] as const;
const C6_GAS = C5_GAS;

// Ore sites ==================================================================
const C1_ORE = [
  'Ordinary Perimeter Deposit',
  'Common Perimeter Deposit',
  'Unexceptional Frontier Deposit',
  'Average Frontier Deposit',
  'Isolated Core Deposit',
  'Uncommon Core Deposit',
] as const;
const C2_ORE = C1_ORE;
const C3_ORE = [
  'Ordinary Perimeter Deposit',
  'Common Perimeter Deposit',
  'Unexceptional Frontier Deposit',
  'Average Frontier Deposit',
  'Infrequent Core Deposit',
  'Unusual Core Deposit',
] as const;
const C4_ORE = [
  'Ordinary Perimeter Deposit',
  'Common Perimeter Deposit',
  'Unexceptional Frontier Deposit',
  'Average Frontier Deposit',
  'Unusual Core Deposit',
  'Infrequent Core Deposit',
] as const;
const C5_ORE = [
  'Average Frontier Deposit',
  'Unexceptional Frontier Deposit',
  'Uncommon Core Deposit',
  'Ordinary Perimeter Deposit',
  'Common Perimeter Deposit',
  'Exceptional Core Deposit',
  'Infrequent Core Deposit',
  'Unusual Core Deposit',
  'Rarified Core Deposit',
  'Isolated Core Deposit',
] as const;
const C6_ORE = [
  'Ordinary Perimeter Deposit',
  'Common Perimeter Deposit',
  'Unexceptional Frontier Deposit',
  'Average Frontier Deposit',
  'Rarified Core Deposit',
] as const;
const C13_ORE = ['Shattered Debris Field', 'Shattered Ice Field'] as const;

// ============================================================================

type ClassSites = Partial<Record<CosmicSignatureGroupKey, readonly string[]>>;

const SITE_CATALOG: Record<string, ClassSites> = {
  C1: { combat: C1_COMBAT, relic: C1_RELIC, data: C1_DATA, gas: C1_GAS, ore: C1_ORE, ghost: WH_GHOST },
  C2: { combat: C2_COMBAT, relic: C2_RELIC, data: C2_DATA, gas: C2_GAS, ore: C2_ORE, ghost: WH_GHOST },
  C3: { combat: C3_COMBAT, relic: C3_RELIC, data: C3_DATA, gas: C3_GAS, ore: C3_ORE, ghost: WH_GHOST },
  C4: { combat: C4_COMBAT, relic: C4_RELIC, data: C4_DATA, gas: C4_GAS, ore: C4_ORE, ghost: WH_GHOST },
  C5: { combat: C5_COMBAT, relic: C5_RELIC, data: C5_DATA, gas: C5_GAS, ore: C5_ORE, ghost: WH_GHOST },
  C6: { combat: C6_COMBAT, relic: C6_RELIC, data: C6_DATA, gas: C6_GAS, ore: C6_ORE, ghost: WH_GHOST },
  C12: { combat: C12_COMBAT }, // Thera
  C13: { ore: C13_ORE, ghost: WH_GHOST }, // Shattered
  C14: { combat: C14_COMBAT }, // Drifter — Sentinel
  C15: { combat: C15_COMBAT }, // Drifter — Barbican
  C16: { combat: C16_COMBAT }, // Drifter — Vidette
  C17: { combat: C17_COMBAT }, // Drifter — Conflux
  C18: { combat: C18_COMBAT }, // Drifter — Redoubt
  H: { ghost: HS_GHOST },
  L: { ghost: LS_GHOST },
  '0.0': { ghost: NS_GHOST },
  // Pochven (P) and Abyssal (A) have no cosmic-site entries in the legacy data.
};

/**
 * Suggested site names for a system's class and a cosmic signature group.
 * Returns `[]` when the class is unknown, has no entries for the group, or
 * `security` is null — callers should treat the result as suggestions only and
 * still accept free text.
 */
export function sitesForClassAndGroup(
  security: string | null,
  group: CosmicSignatureGroupKey,
): readonly string[] {
  if (!security) return [];
  return SITE_CATALOG[security]?.[group] ?? [];
}
