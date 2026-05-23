import 'server-only';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { universeGroup, universeType } from '@/db/schema';
import type { ParsedSigRow } from './signatureParser';

/**
 * Signature paste resolver — server-only `(groupName, name)` → `(groupId, typeId)`
 * lookups against `universe_group` + `universe_type` for parsed probe-scanner rows.
 *
 * The pure parser (`parseSignaturePaste`) lives in a sibling
 * `signatureParser.ts` so the paste dialog can import it without dragging this
 * module's DB client into the client bundle.
 */

export type ResolvedSigRow = ParsedSigRow & {
  groupId: number | null;
  typeId: number | null;
};

/**
 * Resolve `(groupName, name)` against `universe_group` + `universe_type`. Rows
 * with no `groupName` (barely-detected sigs) return null ids. Rows whose
 * `groupName` matches no group, or whose `(groupId, name)` matches no type,
 * carry through with the unresolved fields nulled — partial scans still flow.
 *
 * Two round-trips total regardless of row count: one bulk group lookup, one
 * bulk type lookup keyed by `(groupId, name)` pairs.
 */
export async function resolveSignatureRows(
  rows: ParsedSigRow[],
): Promise<ResolvedSigRow[]> {
  if (rows.length === 0) return [];

  const groupNames = new Set<string>();
  for (const r of rows) if (r.groupName) groupNames.add(r.groupName);

  let groupNameToId = new Map<string, number>();
  if (groupNames.size > 0) {
    const groups = await db
      .select({ id: universeGroup.id, name: universeGroup.name })
      .from(universeGroup)
      .where(inArray(universeGroup.name, [...groupNames]));
    groupNameToId = new Map(groups.map((g) => [g.name, g.id]));
  }

  // Build (groupId, name) → typeId. Use a single OR'd query keyed on the
  // unique pairs the paste actually mentions.
  const pairs: { groupId: number; name: string }[] = [];
  const seenPair = new Set<string>();
  for (const r of rows) {
    if (!r.name || !r.groupName) continue;
    const groupId = groupNameToId.get(r.groupName);
    if (groupId === undefined) continue;
    const key = `${groupId} ${r.name}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    pairs.push({ groupId, name: r.name });
  }

  const pairToTypeId = new Map<string, number>();
  if (pairs.length > 0) {
    const types = await db
      .select({
        id: universeType.id,
        groupId: universeType.groupId,
        name: universeType.name,
      })
      .from(universeType)
      .where(
        or(
          ...pairs.map((p) =>
            and(eq(universeType.groupId, p.groupId), eq(universeType.name, p.name)),
          ),
        ) ?? sql`false`,
      );
    for (const t of types) pairToTypeId.set(`${t.groupId} ${t.name}`, t.id);
  }

  return rows.map((r) => {
    const groupId = r.groupName ? (groupNameToId.get(r.groupName) ?? null) : null;
    const typeId =
      groupId !== null && r.name
        ? (pairToTypeId.get(`${groupId} ${r.name}`) ?? null)
        : null;
    return { ...r, groupId, typeId };
  });
}
