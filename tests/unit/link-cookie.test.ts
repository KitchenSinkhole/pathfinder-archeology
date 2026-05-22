// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { signLinkPayload, verifyLinkPayload } from '@/lib/auth/link-cookie';

describe('link-cookie sign/verify', () => {
  it('round-trips the userId', () => {
    const token = signLinkPayload(42);
    expect(verifyLinkPayload(token)).toBe(42);
  });

  it('rejects a tampered payload', () => {
    const token = signLinkPayload(42);
    const [payload, sig] = token.split('.');
    const tampered = `${payload}AA.${sig}`;
    expect(verifyLinkPayload(tampered)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = signLinkPayload(42);
    const [payload] = token.split('.');
    expect(verifyLinkPayload(`${payload}.deadbeef`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const now = 1_000_000;
    const token = signLinkPayload(42, now);
    expect(verifyLinkPayload(token, now + 299)).toBe(42);
    expect(verifyLinkPayload(token, now + 301)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyLinkPayload('')).toBeNull();
    expect(verifyLinkPayload('no-dot')).toBeNull();
    expect(verifyLinkPayload('.sig')).toBeNull();
  });
});
