import { describe, expect, it } from 'vitest';
import { apertureConfig } from '../../aperture.config';
import {
  connectionExpiresAt,
  connectionTimeLeftMs,
  type ConnectionLifecycleInput,
} from '@/lib/map/connectionState';

const { WORMHOLE_EOL_LIFETIME_MS, WORMHOLE_DEFAULT_LIFETIME_MS } = apertureConfig;

const CREATED = '2026-05-23T12:00:00.000Z';
const CREATED_MS = new Date(CREATED).getTime();
const EOL = '2026-05-23T18:00:00.000Z';
const EOL_MS = new Date(EOL).getTime();

const wh = (overrides: Partial<ConnectionLifecycleInput> = {}): ConnectionLifecycleInput => ({
  scope: 'wh',
  isEol: false,
  eolAt: null,
  createdAt: CREATED,
  ...overrides,
});

describe('connectionExpiresAt', () => {
  it('returns createdAt + WORMHOLE_DEFAULT_LIFETIME_MS for a non-EOL wormhole', () => {
    const result = connectionExpiresAt(wh());
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(CREATED_MS + WORMHOLE_DEFAULT_LIFETIME_MS);
  });

  it('returns eolAt + WORMHOLE_EOL_LIFETIME_MS once a wormhole is EOL', () => {
    const result = connectionExpiresAt(wh({ isEol: true, eolAt: EOL }));
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(EOL_MS + WORMHOLE_EOL_LIFETIME_MS);
  });

  it('returns null for non-wormhole scopes (stargate / jumpbridge / abyssal never expire)', () => {
    for (const scope of ['stargate', 'jumpbridge', 'abyssal'] as const) {
      expect(connectionExpiresAt(wh({ scope }))).toBeNull();
      expect(connectionExpiresAt(wh({ scope, isEol: true, eolAt: EOL }))).toBeNull();
    }
  });

  it('returns null when isEol is true but eolAt is missing (stale snapshot defence)', () => {
    expect(connectionExpiresAt(wh({ isEol: true, eolAt: null }))).toBeNull();
  });
});

describe('connectionTimeLeftMs', () => {
  it('clamps to zero once past expiry instead of going negative', () => {
    const past = CREATED_MS + WORMHOLE_DEFAULT_LIFETIME_MS + 60_000;
    expect(connectionTimeLeftMs(wh(), past)).toBe(0);
  });

  it('returns the remaining ms for a fresh wormhole', () => {
    const remaining = connectionTimeLeftMs(wh(), CREATED_MS + 1_000);
    expect(remaining).toBe(WORMHOLE_DEFAULT_LIFETIME_MS - 1_000);
  });

  it('returns null for non-wormhole scopes', () => {
    expect(connectionTimeLeftMs(wh({ scope: 'stargate' }), CREATED_MS)).toBeNull();
  });

  it('uses the EOL stamp once EOL is flagged', () => {
    const remaining = connectionTimeLeftMs(wh({ isEol: true, eolAt: EOL }), EOL_MS + 1_000);
    expect(remaining).toBe(WORMHOLE_EOL_LIFETIME_MS - 1_000);
  });
});
