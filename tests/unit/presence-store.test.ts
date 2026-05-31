import { describe, expect, it } from 'vitest';
import { PresenceStore } from '@/components/map/MapPresenceContext';
import type { MapPresenceEntry } from '@/lib/map/loadMap';
import type { CharacterUpdateLoad } from '@/lib/realtime/protocol';

function entry(characterId: number, systemId: number): MapPresenceEntry {
  return {
    characterId,
    characterName: `Pilot ${characterId}`,
    systemId,
    shipTypeId: null,
    shipTypeName: null,
    shipName: null,
    locationAt: '2026-05-31T00:00:00.000Z',
  };
}

function update(characterId: number, online: boolean, systemId: number | null): CharacterUpdateLoad {
  return {
    characterId,
    characterName: `Pilot ${characterId}`,
    online,
    systemId,
    shipTypeId: null,
    shipTypeName: null,
    shipName: null,
    locationAt: online ? '2026-05-31T01:00:00.000Z' : null,
  };
}

describe('PresenceStore.getSystemForCharacter', () => {
  it('returns the located system for a character, null otherwise', () => {
    const store = new PresenceStore();
    store.seed([entry(100, 31000005), entry(200, 30000142)]);
    expect(store.getSystemForCharacter(100)).toBe(31000005);
    expect(store.getSystemForCharacter(200)).toBe(30000142);
    expect(store.getSystemForCharacter(999)).toBeNull();
  });

  it('reflects live moves and goes null when the character goes offline', () => {
    const store = new PresenceStore();
    store.seed([entry(100, 31000005)]);

    store.apply(update(100, true, 30000142)); // jumped
    expect(store.getSystemForCharacter(100)).toBe(30000142);

    store.apply(update(100, false, null)); // offline — hidden from presence
    expect(store.getSystemForCharacter(100)).toBeNull();
  });

  it('supports a multi-character "is any pilot in this system?" membership check', () => {
    const store = new PresenceStore();
    // char A parked elsewhere, char B in the selected system.
    store.seed([entry(100, 31000005), entry(200, 30000142)]);
    const selected = 30000142;
    const located = [100, 200]
      .map((id) => store.getSystemForCharacter(id))
      .filter((s): s is number => s !== null);
    expect(located.includes(selected)).toBe(true);
  });
});
