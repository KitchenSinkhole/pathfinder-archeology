import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

// The feed's index query and pg_notify both go through `@/db/client`; mock it so
// the loop logic can be exercised without a database. `loadActiveSystemIndex`
// awaits `db.select(...).from(...).innerJoin(...).where(...)`; `notify` awaits
// `db.execute(...)`.
const INDEX_ROWS = [{ systemId: 30000142, mapId: 1n }];
vi.mock('@/db/client', () => {
  const where = vi.fn(async () => INDEX_ROWS);
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));
  const execute = vi.fn(async () => ({ rows: [] }));
  return { db: { select, execute } };
});

import { db } from '@/db/client';
import {
  __resetZkbFeedState,
  correlateKill,
  pollOnce,
  type SystemIndex,
} from '@/lib/integrations/zkbFeed';
import type { ZkbKill } from '@/lib/integrations/zkb';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
  __resetZkbFeedState();
});

describe('correlateKill', () => {
  const index: SystemIndex = new Map([[30000142, new Set([1n, 7n])]]);

  it('emits one notification per active map watching the kill system', () => {
    const kill = {
      killmail_id: 555,
      solar_system_id: 30000142,
      victim: { ship_type_id: 587 },
      zkb: { totalValue: 8_000_000 },
    } as ZkbKill;

    const out = correlateKill(kill, index);
    expect(out).toHaveLength(2);
    expect(out.map((n) => n.mapId).sort()).toEqual([1, 7]);
    expect(out[0]).toMatchObject({
      systemId: 30000142,
      kind: 'killmail',
      killmail: {
        killmailId: 555,
        shipTypeId: 587,
        totalValue: 8_000_000,
        href: 'https://zkillboard.com/kill/555/',
      },
    });
  });

  it('emits nothing for a system on no active map', () => {
    const kill = { killmail_id: 9, solar_system_id: 30002053 } as ZkbKill;
    expect(correlateKill(kill, index)).toEqual([]);
  });

  it('emits nothing when the kill has no solar system', () => {
    const kill = { killmail_id: 9 } as ZkbKill;
    expect(correlateKill(kill, index)).toEqual([]);
  });
});

describe('pollOnce', () => {
  it('seeds the cursor live on the first sweep without processing kills', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ sequence: 100 })) as unknown as typeof fetch;

    const result = await pollOnce();
    expect(result).toEqual({ processed: 0, notified: 0, cursor: 100 });
    expect(db.execute as Mock).not.toHaveBeenCalled();
  });

  it('walks sequences from the cursor, notifies matches, and stops at a 404', async () => {
    const kill = {
      killmail_id: 555,
      solar_system_id: 30000142,
      victim: { ship_type_id: 587 },
      zkb: { totalValue: 8_000_000 },
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/sequence.json')) return jsonResponse({ sequence: 100 });
      if (url.endsWith('/101.json')) return jsonResponse(kill);
      return new Response('', { status: 404 }); // 102 not yet published → caught up
    }) as unknown as typeof fetch;

    await pollOnce(); // seed cursor = 100
    const result = await pollOnce();

    expect(result.processed).toBe(1);
    expect(result.notified).toBe(1);
    expect(result.cursor).toBe(101); // not advanced past the 404'd 102
    expect(db.execute as Mock).toHaveBeenCalledTimes(1);
  });
});
