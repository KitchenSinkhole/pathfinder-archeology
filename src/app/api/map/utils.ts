import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMap } from '@/db/schema';

/**
 * Shared guard helpers for the `/api/map/**` route layer. The three concerns
 * (id parsing, map-existence check, session check) are separated here so each
 * route stays concise.
 */

/** Parse a URL segment that must be a positive-integer string. Returns null on failure. */
export function parseBigInt(s: string): bigint | null {
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

/**
 * Verify a map exists and is not soft-deleted. Returns `{ mapId }` on success,
 * or `null` when the map is missing or has `deleted_at` set. Callers should
 * return HTTP 404 on null.
 */
export async function guardMap(rawId: string): Promise<{ mapId: bigint } | null> {
  const mapId = parseBigInt(rawId);
  if (!mapId) return null;
  const [row] = await db
    .select({ id: apMap.id })
    .from(apMap)
    .where(and(eq(apMap.id, mapId), isNull(apMap.deletedAt)));
  return row ? { mapId: row.id } : null;
}
