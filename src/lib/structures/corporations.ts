import 'server-only';
import { and, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { universeCorporation } from '@/db/schema';

/**
 * Read/write helpers for the `universe_corporation` name cache. The structure
 * owner search resolves corp ids → names through here so repeat lookups of the
 * same corp serve from the DB instead of re-hitting ESI, and the structure
 * mutations upsert the picked corp so the `owner_corporation_id` FK target exists.
 */

/** Names older than this are re-resolved from ESI on the next search (corps can rename). */
export const CORP_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cached, still-fresh corp names for `ids`, keyed by id. Stale or uncached ids
 * are simply absent from the map — the caller resolves those from ESI.
 */
export async function freshCachedCorporationNames(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const cutoff = new Date(Date.now() - CORP_CACHE_TTL_MS);
  const rows = await db
    .select({ id: universeCorporation.id, name: universeCorporation.name })
    .from(universeCorporation)
    .where(
      and(
        inArray(
          universeCorporation.id,
          ids.map((id) => BigInt(id)),
        ),
        gt(universeCorporation.lastFetchedAt, cutoff),
      ),
    );
  const out = new Map<number, string>();
  for (const r of rows) out.set(Number(r.id), r.name);
  return out;
}

/**
 * Upsert corp cache rows, refreshing `name` and `last_fetched_at` on conflict.
 * No-op on an empty list.
 */
export async function upsertCorporations(rows: { id: number; name: string }[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(universeCorporation)
    .values(rows.map((r) => ({ id: BigInt(r.id), name: r.name })))
    .onConflictDoUpdate({
      target: universeCorporation.id,
      set: { name: sql`excluded.name`, lastFetchedAt: sql`now()` },
    });
}
