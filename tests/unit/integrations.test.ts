import { afterEach, describe, expect, it, vi } from 'vitest';
import { factionWarSystemsSchema, sovereigntyMapSchema } from '@/lib/esi/decoders';
import { eveScoutConnectionsSchema, fetchEveScoutConnections } from '@/lib/integrations/evescout';
import { fetchChangelogReleases, githubReleasesSchema } from '@/lib/integrations/github';
import {
  anoikSystemUrl,
  ccpImageUrl,
  dotlanSystemUrl,
  eveeyeSystemUrl,
  zkillboardSystemUrl,
} from '@/lib/integrations/links';
import { recentKillsForSystem, ZkbRateLimitError, zkbRecentKillsSchema } from '@/lib/integrations/zkb';

const originalFetch = globalThis.fetch;

function mockJson(body: unknown, init?: ResponseInit) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: init?.headers,
    }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Stage 13 decoders', () => {
  it('accepts sovereignty and FW ESI payloads', () => {
    expect(
      sovereigntyMapSchema.parse([
        { system_id: 30000142, alliance_id: 99000001, corporation_id: 98000001 },
        { system_id: 30002053, faction_id: 500001 },
      ]),
    ).toHaveLength(2);
    expect(
      factionWarSystemsSchema.parse([
        {
          solar_system_id: 30045339,
          owner_faction_id: 500001,
          occupier_faction_id: 500002,
          contested: 'contested',
          victory_points: 42,
          victory_points_threshold: 100,
        },
      ]),
    ).toHaveLength(1);
  });

  it('accepts representative third-party payloads', () => {
    expect(
      zkbRecentKillsSchema.parse([
        {
          killmail_id: 123,
          killmail_time: '2026-05-26T12:00:00Z',
          victim: { ship_type_id: 670 },
          attackers: [{ character_id: 1 }],
          zkb: { totalValue: 1234567 },
        },
      ]),
    ).toHaveLength(1);
    expect(
      eveScoutConnectionsSchema.parse([
        {
          out_system_name: 'Thera',
          out_system_id: 31000005,
          in_system_name: 'Jita',
          in_system_id: 30000142,
        },
      ]),
    ).toHaveLength(1);
    expect(
      githubReleasesSchema.parse([
        {
          id: 1,
          tag_name: 'v1.0.0',
          name: 'v1',
          body: 'notes',
          html_url: 'https://github.com/example/repo/releases/tag/v1.0.0',
          published_at: '2026-05-26T12:00:00Z',
          prerelease: false,
          draft: false,
        },
      ]),
    ).toHaveLength(1);
  });
});

describe('Stage 13 link helpers', () => {
  it('builds external links', () => {
    expect(dotlanSystemUrl('Jita')).toBe('https://evemaps.dotlan.net/system/Jita');
    expect(dotlanSystemUrl('Amarr VIII')).toBe('https://evemaps.dotlan.net/system/Amarr_VIII');
    expect(eveeyeSystemUrl(30000142)).toBe('https://eveeye.com/?system=30000142');
    expect(anoikSystemUrl('J123456')).toBe('https://anoik.is/systems/J123456');
    expect(zkillboardSystemUrl(30000142)).toBe('https://zkillboard.com/system/30000142/');
    expect(ccpImageUrl('alliances', 99000001, 'logo', 64)).toBe(
      'https://images.evetech.net/alliances/99000001/logo?size=64',
    );
  });
});

describe('Stage 13 integration clients', () => {
  it('maps zKillboard recent kills and surfaces rate limits', async () => {
    mockJson([
      {
        killmail_id: 555,
        killmail_time: '2026-05-26T12:00:00Z',
        victim: { ship_type_id: 587 },
        attackers: [{}, {}],
        zkb: { totalValue: 8000000 },
      },
    ]);
    await expect(recentKillsForSystem(30000142)).resolves.toEqual([
      {
        killmailId: 555,
        href: 'https://zkillboard.com/kill/555/',
        killmailTime: '2026-05-26T12:00:00Z',
        shipTypeId: 587,
        totalValue: 8000000,
        attackers: 2,
      },
    ]);

    mockJson({ error: 'slow down' }, { status: 429, headers: { 'retry-after': '60' } });
    await expect(recentKillsForSystem(30000142)).rejects.toBeInstanceOf(ZkbRateLimitError);
  });

  it('maps EVE-Scout connections and rejects error envelopes', async () => {
    mockJson([
      {
        out_system_name: 'Thera',
        out_system_id: 31000005,
        in_system_name: 'Jita',
        in_system_id: 30000142,
        in_signature: 'ABC',
        updated_at: '2026-05-26T12:00:00Z',
      },
    ]);
    await expect(fetchEveScoutConnections()).resolves.toEqual([
      {
        sourceName: 'Thera',
        sourceSystemId: 31000005,
        targetName: 'Jita',
        targetSystemId: 30000142,
        signatureId: 'ABC',
        hub: 'Thera',
        updatedAt: '2026-05-26T12:00:00Z',
        expiresAt: null,
      },
    ]);

    mockJson({ error: 'bad shape' });
    await expect(fetchEveScoutConnections()).rejects.toThrow('bad shape');
  });

  it('maps GitHub changelog releases', async () => {
    mockJson([
      {
        id: 10,
        tag_name: 'v2.0.0',
        name: null,
        body: null,
        html_url: 'https://github.com/example/repo/releases/tag/v2.0.0',
        published_at: null,
        prerelease: true,
        draft: false,
      },
    ]);
    await expect(fetchChangelogReleases(1)).resolves.toEqual([
      {
        id: 10,
        tagName: 'v2.0.0',
        name: 'v2.0.0',
        body: '',
        href: 'https://github.com/example/repo/releases/tag/v2.0.0',
        publishedAt: null,
        prerelease: true,
      },
    ]);
  });
});
