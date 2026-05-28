// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { signSetupPayload, verifySetupPayload } from '@/lib/auth/setup-cookie';

const FOUR_HOURS = 4 * 60 * 60;

describe('setup-cookie sign/verify', () => {
  it('round-trips a valid token', () => {
    const token = signSetupPayload();
    expect(verifySetupPayload(token)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const token = signSetupPayload();
    const [payload, sig] = token.split('.');
    const tampered = `${payload}AA.${sig}`;
    expect(verifySetupPayload(tampered)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const token = signSetupPayload();
    const [payload] = token.split('.');
    expect(verifySetupPayload(`${payload}.deadbeef`)).toBe(false);
  });

  it('rejects an expired token', () => {
    const now = 1_000_000;
    const token = signSetupPayload(now);
    expect(verifySetupPayload(token, now + FOUR_HOURS - 1)).toBe(true);
    expect(verifySetupPayload(token, now + FOUR_HOURS + 1)).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(verifySetupPayload('')).toBe(false);
    expect(verifySetupPayload('no-dot')).toBe(false);
    expect(verifySetupPayload('.sig')).toBe(false);
  });
});
