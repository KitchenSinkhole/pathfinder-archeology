import type { MapSystemNode } from './loadMap';

/**
 * Whether a map system is wormhole (J-) space. K-space–only stats — the
 * `ap_system_stats` ESI feed (jumps/kills) and the dotlan-style system graph —
 * don't exist for wormholes, so the kill-stats and graph modules gate on this.
 * A system is J-space if it has statics or its name is the `J######` form.
 */
export function isWormholeSystem(system: MapSystemNode): boolean {
  return system.statics.length > 0 || /^J\d{6}$/.test(system.name);
}
