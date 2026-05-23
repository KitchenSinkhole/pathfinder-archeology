import { describe, expect, it } from 'vitest';
import { formatRelativeFromMs } from '@/lib/map/relativeTime';

describe('formatRelativeFromMs', () => {
  it('returns "expired" for zero or negative input', () => {
    expect(formatRelativeFromMs(0)).toBe('expired');
    expect(formatRelativeFromMs(-1)).toBe('expired');
    expect(formatRelativeFromMs(-3_600_000)).toBe('expired');
  });

  it('rounds sub-day deltas to whole hours', () => {
    expect(formatRelativeFromMs(60 * 60 * 1000)).toBe('1h');
    expect(formatRelativeFromMs(23 * 60 * 60 * 1000)).toBe('23h');
    // 23h 40m rounds to 24h, then renders as 1d
    expect(formatRelativeFromMs(23 * 60 * 60 * 1000 + 40 * 60 * 1000)).toBe('1d');
  });

  it('rounds multi-day deltas to whole days', () => {
    expect(formatRelativeFromMs(48 * 60 * 60 * 1000)).toBe('2d');
    expect(formatRelativeFromMs(5 * 24 * 60 * 60 * 1000)).toBe('5d');
  });

  it('treats sub-30-minute deltas as expired (rounds down to 0h)', () => {
    expect(formatRelativeFromMs(15 * 60 * 1000)).toBe('expired');
  });

  it('returns "expired" for NaN / non-finite input', () => {
    expect(formatRelativeFromMs(Number.NaN)).toBe('expired');
    expect(formatRelativeFromMs(Number.POSITIVE_INFINITY)).toBe('expired');
  });
});
