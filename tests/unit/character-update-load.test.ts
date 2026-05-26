import { describe, expect, it } from 'vitest';
import { characterUpdateLoadSchema } from '@/lib/realtime/protocol';

// The presence-badge feature relies on `characterName` + `shipTypeName` being
// part of the wire contract; the client renders the hover panel directly off
// these fields without a roster join.
describe('characterUpdateLoadSchema', () => {
  it('parses a complete online envelope', () => {
    const result = characterUpdateLoadSchema.safeParse({
      characterId: 90000001,
      characterName: 'Wojtek',
      online: true,
      systemId: 30000142,
      shipTypeId: 11176,
      shipTypeName: 'Crow',
      locationAt: '2026-05-26T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an offline envelope with null shipTypeName', () => {
    const result = characterUpdateLoadSchema.safeParse({
      characterId: 90000001,
      characterName: 'Wojtek',
      online: false,
      systemId: 30000142,
      shipTypeId: null,
      shipTypeName: null,
      locationAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing characterName', () => {
    const result = characterUpdateLoadSchema.safeParse({
      characterId: 90000001,
      online: true,
      systemId: 30000142,
      shipTypeId: 11176,
      shipTypeName: 'Crow',
      locationAt: '2026-05-26T12:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing shipTypeName', () => {
    const result = characterUpdateLoadSchema.safeParse({
      characterId: 90000001,
      characterName: 'Wojtek',
      online: true,
      systemId: 30000142,
      shipTypeId: 11176,
      locationAt: '2026-05-26T12:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
