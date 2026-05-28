import { describe, expect, it } from 'vitest';
import { sitesForClassAndGroup } from '@/lib/map/signatureSites';

describe('sitesForClassAndGroup', () => {
  it('returns the four C2 combat sites', () => {
    expect(sitesForClassAndGroup('C2', 'combat')).toEqual([
      'Perimeter Checkpoint',
      'Perimeter Hangar',
      'The Ruins of Enclave Cohort 27',
      'Sleeper Data Sanctuary',
    ]);
  });

  it('merges the NullSec relic list into C1 relic, plus the C1-specific sites', () => {
    const c1Relic = sitesForClassAndGroup('C1', 'relic');
    expect(c1Relic).toContain('Forgotten Perimeter Coronation Platform');
    expect(c1Relic).toContain('Forgotten Perimeter Power Array');
    // shared NullSec relic entries also appear in C1–C3
    expect(c1Relic).toContain('Ruined Guristas Temple Site');
  });

  it('returns the shattered ore fields for C13', () => {
    expect(sitesForClassAndGroup('C13', 'ore')).toEqual([
      'Shattered Debris Field',
      'Shattered Ice Field',
    ]);
  });

  it('returns class-specific ghost lists for k-space bands', () => {
    expect(sitesForClassAndGroup('H', 'ghost')).toContain(
      'Lesser Serpentis Covert Research Facility',
    );
    expect(sitesForClassAndGroup('L', 'ghost')).toContain(
      'Standard Serpentis Covert Research Facility',
    );
    expect(sitesForClassAndGroup('0.0', 'ghost')).toContain(
      'Improved Serpentis Covert Research Facility',
    );
  });

  it('returns [] where the legacy data has no entries', () => {
    expect(sitesForClassAndGroup('H', 'combat')).toEqual([]);
    expect(sitesForClassAndGroup('P', 'ore')).toEqual([]);
    expect(sitesForClassAndGroup('C2', 'wormhole' as never)).toEqual([]);
  });

  it('returns [] for unknown or null class', () => {
    expect(sitesForClassAndGroup(null, 'combat')).toEqual([]);
    expect(sitesForClassAndGroup('C99', 'combat')).toEqual([]);
  });
});
