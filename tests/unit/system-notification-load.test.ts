import { describe, expect, it } from 'vitest';
import { systemNotificationLoadSchema } from '@/lib/realtime/protocol';

// The Stage 17.8 underglow bridge parses incoming `systemNotification` loads
// with this schema (and the bus drops malformed ones via the same safeParse),
// so the wire contract is pinned here.
describe('systemNotificationLoadSchema', () => {
  it('parses a complete killmail notification', () => {
    const result = systemNotificationLoadSchema.safeParse({
      mapId: 42,
      systemId: 30000142,
      kind: 'killmail',
      killmail: {
        killmailId: 555,
        shipTypeId: 587,
        totalValue: 8_000_000,
        href: 'https://zkillboard.com/kill/555/',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts null shipTypeId / totalValue', () => {
    const result = systemNotificationLoadSchema.safeParse({
      mapId: 42,
      systemId: 31000005,
      kind: 'killmail',
      killmail: { killmailId: 1, shipTypeId: null, totalValue: null, href: 'x' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    const result = systemNotificationLoadSchema.safeParse({
      mapId: 42,
      systemId: 30000142,
      kind: 'wormhole-collapse',
      killmail: { killmailId: 1, shipTypeId: null, totalValue: null, href: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing the killmail body', () => {
    const result = systemNotificationLoadSchema.safeParse({
      mapId: 42,
      systemId: 30000142,
      kind: 'killmail',
    });
    expect(result.success).toBe(false);
  });
});
