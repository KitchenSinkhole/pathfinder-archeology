/**
 * Derives Pathfinder's denormalized `security` label for a solar system from
 * the static data available in the SDE: region id, the system's constellation
 * `wormholeClassID`, and raw `securityStatus`.
 *
 * Label set (legacy parity): `A` (Abyssal), `P` (Pochven), `C1`–`Cn` (wormhole
 * space, where n is the constellation's wormhole class), and `H`/`L`/`0.0` for
 * known k-space derived from rounded security status.
 *
 * Region-id ranges (Tranquility): Abyssal regions are `[12000000, 13000000)`,
 * Pochven is region `10000070`, and wormhole regions are `[11000000, 12000000)`.
 * Empire k-space constellations all share `wormholeClassID = 7`, so hi/lo/null
 * cannot be read from the class — it is derived from `securityStatus`.
 */

const ABYSSAL_REGION_MIN = 12000000;
const ABYSSAL_REGION_MAX = 13000000; // exclusive
const POCHVEN_REGION_ID = 10000070;
const WORMHOLE_REGION_MIN = 11000000;
const WORMHOLE_REGION_MAX = 12000000; // exclusive

export interface SecurityInput {
  regionId: number;
  /** `wormholeClassID` of the system's constellation, if any. */
  wormholeClassId: number | null;
  /** Raw ESI/SDE security status. */
  securityStatus: number | null;
}

/** EVE rounds security status to one decimal (e.g. 0.439 → 0.4, 0.45 → 0.5). */
export function roundSecurity(securityStatus: number): number {
  return Math.round(securityStatus * 10) / 10;
}

export function deriveSecurityLabel(input: SecurityInput): string {
  const { regionId, wormholeClassId, securityStatus } = input;

  if (regionId >= ABYSSAL_REGION_MIN && regionId < ABYSSAL_REGION_MAX) return 'A';
  if (regionId === POCHVEN_REGION_ID) return 'P';
  if (regionId >= WORMHOLE_REGION_MIN && regionId < WORMHOLE_REGION_MAX) {
    return wormholeClassId != null ? `C${wormholeClassId}` : 'C?';
  }

  const sec = securityStatus ?? 0;
  const rounded = roundSecurity(sec);
  if (rounded >= 0.5) return 'H';
  if (rounded >= 0.1) return 'L';
  return '0.0';
}
