import { describe, expect, it } from 'vitest';
import {
  formatHistoryMessage,
  formatRallyMessage,
  isRallySetEvent,
  type WebhookEventContext,
} from '@/lib/webhooks/formatters';
import type { MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Stage 14 unit coverage for the pure formatters. The dispatcher tests
 * (DB-gated) cover end-to-end POST behaviour; here we just pin the rendered
 * Discord payload shape for each `MapEventPayload` variant.
 */

const baseCtx: WebhookEventContext = {
  mapName: 'Test Map',
  characterName: 'Pilot Foo',
  systemName: 'Jita',
  sourceSystemName: 'Jita',
  targetSystemName: 'Amarr',
};

describe('isRallySetEvent', () => {
  it('returns true for a system.updated with non-null rallyAt', () => {
    const event: MapEventPayload = {
      kind: 'system.updated',
      eventId: 1,
      id: '42',
      rallyAt: '2026-05-27T12:00:00.000Z',
    };
    expect(isRallySetEvent(event)).toBe(true);
  });

  it('returns false for rally cleared', () => {
    const event: MapEventPayload = {
      kind: 'system.updated',
      eventId: 1,
      id: '42',
      rallyAt: null,
    };
    expect(isRallySetEvent(event)).toBe(false);
  });

  it('returns false for non-system-updated events', () => {
    const event: MapEventPayload = {
      kind: 'system.removed',
      eventId: 1,
      id: '42',
    };
    expect(isRallySetEvent(event)).toBe(false);
  });
});

describe('formatHistoryMessage', () => {
  it('renders system.added with the system name from the payload', () => {
    const event: MapEventPayload = {
      kind: 'system.added',
      eventId: 1,
      id: '42',
      systemId: 30000142,
      name: 'Jita',
      alias: null,
      tag: null,
      status: 'unknown',
      security: '0.9',
      trueSec: 0.95,
      effect: null,
      regionName: 'The Forge',
      constellationName: 'Kimotoro',
      statics: [],
      locked: false,
      positionX: 0,
      positionY: 0,
    };
    const payload = formatHistoryMessage(event, baseCtx);
    expect(payload?.content).toBe('**Test Map** — Pilot Foo added **Jita** to the map.');
  });

  it('renders a rally-set update with the rally phrasing', () => {
    const event: MapEventPayload = {
      kind: 'system.updated',
      eventId: 2,
      id: '42',
      rallyAt: '2026-05-27T12:00:00.000Z',
    };
    expect(formatHistoryMessage(event, baseCtx)?.content).toBe(
      '**Test Map** — Pilot Foo set a rally point in **Jita**.',
    );
  });

  it('renders a rally-clear update with the cleared phrasing', () => {
    const event: MapEventPayload = {
      kind: 'system.updated',
      eventId: 3,
      id: '42',
      rallyAt: null,
    };
    expect(formatHistoryMessage(event, baseCtx)?.content).toBe(
      '**Test Map** — Pilot Foo cleared the rally point in **Jita**.',
    );
  });

  it('falls back to "Aperture" when no character is attached', () => {
    const event: MapEventPayload = {
      kind: 'system.removed',
      eventId: 4,
      id: '42',
    };
    const payload = formatHistoryMessage(event, { ...baseCtx, characterName: null });
    expect(payload?.content).toBe('**Test Map** — Aperture removed **Jita** from the map.');
  });

  it('returns null for a position-only update (nothing worth saying)', () => {
    const event: MapEventPayload = {
      kind: 'system.updated',
      eventId: 5,
      id: '42',
      positionX: 100,
      positionY: 200,
    };
    expect(formatHistoryMessage(event, baseCtx)).toBeNull();
  });

  it('renders connection.create with both endpoint names', () => {
    const event: MapEventPayload = {
      kind: 'connection.create',
      eventId: 6,
      id: '7',
      source: '1',
      target: '2',
      scope: 'wh',
      massStatus: 'fresh',
      jumpMassClass: 'l',
      isEol: false,
      preserveMass: false,
      isRolling: false,
      eolAt: null,
      createdAt: '2026-05-27T12:00:00.000Z',
    };
    expect(formatHistoryMessage(event, baseCtx)?.content).toBe(
      '**Test Map** — Pilot Foo connected **Jita** ↔ **Amarr**.',
    );
  });

  it('renders connection.update EOL flip', () => {
    const event: MapEventPayload = {
      kind: 'connection.update',
      eventId: 7,
      id: '7',
      isEol: true,
    };
    expect(formatHistoryMessage(event, baseCtx)?.content).toBe(
      '**Test Map** — Pilot Foo marked **Jita** ↔ **Amarr** as EOL.',
    );
  });

  it('renders signature.create with the sig id', () => {
    const event: MapEventPayload = {
      kind: 'signature.create',
      eventId: 8,
      id: '99',
      mapSystemId: '42',
      mapConnectionId: null,
      sigId: 'ABC-123',
      groupKey: null,
      typeId: null,
      wormholeCode: null,
      name: null,
      description: null,
      expiresAt: '2026-06-01T00:00:00.000Z',
    };
    expect(formatHistoryMessage(event, baseCtx)?.content).toBe(
      '**Test Map** — Pilot Foo added signature `ABC-123` in **Jita**.',
    );
  });
});

describe('formatRallyMessage', () => {
  it('renders an embed with red color, title, and the rally timestamp', () => {
    const event: MapEventPayload = {
      kind: 'system.updated',
      eventId: 9,
      id: '42',
      rallyAt: '2026-05-27T12:00:00.000Z',
    };
    const payload = formatRallyMessage(event, baseCtx);
    expect(payload?.embeds).toHaveLength(1);
    const embed = payload!.embeds![0]!;
    expect(embed.title).toBe('Rally point set in Jita');
    expect(embed.description).toBe('Set by **Pilot Foo** on **Test Map**.');
    expect(embed.color).toBe(0xe74c3c);
    expect(embed.timestamp).toBe('2026-05-27T12:00:00.000Z');
  });

  it('returns null when the event is not a rally-set event', () => {
    const event: MapEventPayload = {
      kind: 'system.updated',
      eventId: 10,
      id: '42',
      rallyAt: null,
    };
    expect(formatRallyMessage(event, baseCtx)).toBeNull();
  });
});
