import { z } from 'zod';
import { apertureConfig } from '../../../aperture.config';

const ZKB_BASE = 'https://zkillboard.com';

export const zkbKillSchema = z
  .object({
    killmail_id: z.number().int(),
    killmail_time: z.string().optional(),
    solar_system_id: z.number().int().optional(),
    victim: z
      .object({
        character_id: z.number().int().optional(),
        corporation_id: z.number().int().optional(),
        alliance_id: z.number().int().optional(),
        ship_type_id: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
    attackers: z.array(z.unknown()).optional(),
    zkb: z
      .object({
        hash: z.string().optional(),
        totalValue: z.number().optional(),
        locationID: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const zkbRecentKillsSchema = z.array(zkbKillSchema);

export type ZkbKill = z.infer<typeof zkbKillSchema>;

/**
 * What zKillboard's per-system list endpoint actually returns for each kill:
 * the id, the ESI hash, and zkb-derived value. Victim / ship / time / attacker
 * count are *not* in this response — they come from the full ESI killmail,
 * which the `hash` unlocks (see `@/lib/map/killboard`).
 */
export type RecentKillSummary = {
  killmailId: number;
  hash: string | null;
  href: string;
  totalValue: number | null;
};

export class ZkbRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number | null) {
    super('zKillboard rate limit reached');
    this.name = 'ZkbRateLimitError';
  }
}

export class ZkbHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`zKillboard request failed: ${status}`);
    this.name = 'ZkbHttpError';
  }
}

export async function recentKillsForSystem(
  systemId: number,
  limit = 5,
): Promise<RecentKillSummary[]> {
  const url = `${ZKB_BASE}/api/kills/solarSystemID/${systemId}/`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Aperture/0.0.0',
    },
    signal: AbortSignal.timeout(apertureConfig.INTEGRATION_REQUEST_TIMEOUT_MS),
  });

  if (res.status === 420 || res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new ZkbRateLimitError(Number.isFinite(retryAfter) ? retryAfter : null);
  }
  if (!res.ok) {
    throw new ZkbHttpError(res.status, await res.text());
  }

  const parsed = zkbRecentKillsSchema.parse(await res.json());
  return parsed.slice(0, limit).map((kill) => ({
    killmailId: kill.killmail_id,
    hash: kill.zkb?.hash ?? null,
    href: `${ZKB_BASE}/kill/${kill.killmail_id}/`,
    totalValue: kill.zkb?.totalValue ?? null,
  }));
}
