'use client';

import { requestJson, type FetchResult } from '@/lib/http/fetchJson';
import type { WormholeJumpInfoRow } from '@/lib/eve/wormholeJumpInfo';

/**
 * Browser-side fetch for the static reference dialogs. The wormhole jump catalog
 * is immutable for a session, so the first successful response is memoised and
 * reused — the Jump Info dialog can reopen without re-hitting the network.
 */

let cache: WormholeJumpInfoRow[] | null = null;

export async function fetchWormholeJumpInfo(): Promise<FetchResult<WormholeJumpInfoRow[]>> {
  if (cache) return { ok: true, data: cache };
  const result = await requestJson<FetchResult<WormholeJumpInfoRow[]>>(
    'GET',
    '/api/reference/wormholes',
  );
  if (result.ok) cache = result.data;
  return result;
}
