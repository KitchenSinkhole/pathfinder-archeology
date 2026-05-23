import { describe, it, expect } from 'vitest';
import { applyEvent } from '@/lib/map/applyEvent';
import type { MapConnectionEdge, MapSystemNode, MapViewData } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeState = (overrides?: Partial<MapViewData>): MapViewData => ({
  map: { id: '1', name: 'Test Map', scope: 'wh', type: 'private' },
  systems: [],
  connections: [],
  ...overrides,
});

const sys1: MapSystemNode = {
  id: '10',
  systemId: 30000142,
  name: 'Jita',
  alias: null,
  tag: null,
  status: 'unknown',
  security: '0.9',
  trueSec: 0.9,
  effect: null,
  regionName: 'The Forge',
  constellationName: 'Kimotoro',
  statics: [],
  locked: false,
  positionX: 100,
  positionY: 200,
};

const sys2: MapSystemNode = { ...sys1, id: '11', systemId: 30000143, name: 'Perimeter' };

const conn1: MapConnectionEdge = {
  id: '20',
  source: '10',
  target: '11',
  scope: 'wh',
  massStatus: 'fresh',
  jumpMassClass: null,
  isEol: false,
  isFrigate: false,
  preserveMass: false,
  isRolling: false,
};

// ---------------------------------------------------------------------------
// system.added
// ---------------------------------------------------------------------------

describe('applyEvent — system.added', () => {
  it('appends a new system to an empty map', () => {
    const next = applyEvent(makeState(), { kind: 'system.added', eventId: 1, ...sys1 });
    expect(next.systems).toHaveLength(1);
    expect(next.systems[0]).toMatchObject({ id: '10', name: 'Jita' });
  });

  it('replaces an existing system with the same id (re-activation upsert)', () => {
    const state = makeState({ systems: [sys1] });
    const updated = { ...sys1, alias: 'Home', positionX: 999 };
    const next = applyEvent(state, { kind: 'system.added', eventId: 2, ...updated });
    expect(next.systems).toHaveLength(1);
    expect(next.systems[0]).toMatchObject({ alias: 'Home', positionX: 999 });
  });

  it('does not mutate the original state', () => {
    const state = makeState();
    applyEvent(state, { kind: 'system.added', eventId: 3, ...sys1 });
    expect(state.systems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// system.removed
// ---------------------------------------------------------------------------

describe('applyEvent — system.removed', () => {
  it('removes a system by id', () => {
    const state = makeState({ systems: [sys1, sys2] });
    const next = applyEvent(state, { kind: 'system.removed', eventId: 4, id: '10' });
    expect(next.systems).toHaveLength(1);
    expect(next.systems[0]!.id).toBe('11');
  });

  it('is a no-op for an id not in the canvas', () => {
    const state = makeState({ systems: [sys1] });
    const next = applyEvent(state, { kind: 'system.removed', eventId: 5, id: '999' });
    expect(next.systems).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// system.updated
// ---------------------------------------------------------------------------

describe('applyEvent — system.updated', () => {
  it('merges a partial patch (only provided fields change)', () => {
    const state = makeState({ systems: [sys1] });
    const next = applyEvent(state, {
      kind: 'system.updated',
      eventId: 6,
      id: '10',
      status: 'hostile',
      locked: true,
    });
    expect(next.systems[0]).toMatchObject({ status: 'hostile', locked: true, name: 'Jita' });
  });

  it('updates position fields', () => {
    const state = makeState({ systems: [sys1] });
    const next = applyEvent(state, {
      kind: 'system.updated',
      eventId: 7,
      id: '10',
      positionX: 500,
      positionY: 600,
    });
    expect(next.systems[0]).toMatchObject({ positionX: 500, positionY: 600 });
  });

  it('ignores intelNotes and rallyAt (not in MapViewData)', () => {
    const state = makeState({ systems: [sys1] });
    const next = applyEvent(state, {
      kind: 'system.updated',
      eventId: 8,
      id: '10',
      intelNotes: 'enemy camp',
      rallyAt: '2026-01-01T00:00:00Z',
    });
    expect(next.systems[0]).not.toHaveProperty('intelNotes');
    expect(next.systems[0]).not.toHaveProperty('rallyAt');
  });

  it('is a no-op for an unknown id', () => {
    const state = makeState({ systems: [sys1] });
    const next = applyEvent(state, {
      kind: 'system.updated',
      eventId: 9,
      id: '999',
      status: 'hostile',
    });
    expect(next.systems[0]!.status).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// connection.create
// ---------------------------------------------------------------------------

describe('applyEvent — connection.create', () => {
  it('appends a new connection', () => {
    const state = makeState();
    const next = applyEvent(state, { kind: 'connection.create', eventId: 10, ...conn1 });
    expect(next.connections).toHaveLength(1);
    expect(next.connections[0]).toMatchObject({ id: '20', scope: 'wh' });
  });
});

// ---------------------------------------------------------------------------
// connection.update
// ---------------------------------------------------------------------------

describe('applyEvent — connection.update', () => {
  it('merges a partial patch (eolAt excluded from edge)', () => {
    const state = makeState({ connections: [conn1] });
    const next = applyEvent(state, {
      kind: 'connection.update',
      eventId: 11,
      id: '20',
      massStatus: 'critical',
      isEol: true,
      eolAt: '2026-01-01T00:00:00Z',
    });
    const c = next.connections[0]!;
    expect(c.massStatus).toBe('critical');
    expect(c.isEol).toBe(true);
    expect(c).not.toHaveProperty('eolAt');
  });

  it('is a no-op for an unknown id', () => {
    const state = makeState({ connections: [conn1] });
    const next = applyEvent(state, {
      kind: 'connection.update',
      eventId: 12,
      id: '999',
      massStatus: 'reduced',
    });
    expect(next.connections[0]!.massStatus).toBe('fresh');
  });
});

// ---------------------------------------------------------------------------
// connection.delete
// ---------------------------------------------------------------------------

describe('applyEvent — connection.delete', () => {
  it('removes a connection by id', () => {
    const state = makeState({ connections: [conn1] });
    const next = applyEvent(state, { kind: 'connection.delete', eventId: 13, id: '20' });
    expect(next.connections).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// map.update
// ---------------------------------------------------------------------------

describe('applyEvent — map.update', () => {
  it('updates the map name when provided', () => {
    const state = makeState();
    const next = applyEvent(state, {
      kind: 'map.update',
      eventId: 14,
      id: '1',
      name: 'Renamed Map',
    });
    expect(next.map.name).toBe('Renamed Map');
  });

  it('is a no-op when name is absent', () => {
    const state = makeState();
    const next = applyEvent(state, {
      kind: 'map.update',
      eventId: 15,
      id: '1',
      logActivity: true,
    });
    expect(next.map.name).toBe('Test Map');
    expect(next).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// No-op events
// ---------------------------------------------------------------------------

describe('applyEvent — no-op events', () => {
  const noopKinds = [
    { kind: 'signature.create' as const, eventId: 20, id: 'sig1', mapSystemId: '10', mapConnectionId: null, sigId: 'ABC-123', groupId: null, typeId: null, name: null, description: null, expiresAt: '2026-12-31T00:00:00Z' },
    { kind: 'signature.update' as const, eventId: 21, id: 'sig1' },
    { kind: 'signature.delete' as const, eventId: 22, id: 'sig1' },
    { kind: 'map.create' as const, eventId: 23, id: '2', name: 'New Map', scope: 'wh' as const, type: 'private' as const, icon: null },
    { kind: 'map.delete' as const, eventId: 24, id: '1' },
  ];

  for (const payload of noopKinds) {
    it(`returns the same state reference for ${payload.kind}`, () => {
      const state = makeState({ systems: [sys1], connections: [conn1] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = applyEvent(state, payload as any);
      expect(next).toBe(state);
    });
  }
});
