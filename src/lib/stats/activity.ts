import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db } from '@/db/client';
import { apCharacter, apMap } from '@/db/schema';
import { viewableMapPredicate } from '@/lib/auth/rights';

/**
 * Stage 17.7. Server-side activity-statistics reader over the
 * `ap_activity_rollup` materialized view (`src/db/views/activity_rollup.sql`).
 *
 * The legacy `stats.js` dialog ranked characters by activity across all maps of
 * a given scope (private/corp/alliance — no mapId). This module reproduces that
 * shape from the weekly rollup:
 *
 *   - **Main-character attribution** — every rollup row's `character_id` rolls
 *     up to the acting character's account *main* (`ap_user.main_character_id`),
 *     summing an account's alts into one row. The erased-character sentinel
 *     (`character_id = 0`) and any character with no resolvable user fall into
 *     the `'0'` "unknown" bucket.
 *   - **Non-contributions excluded** — `map.*` kinds are map-lifecycle noise,
 *     and `system.moved` (the rollup's derived bucket for drag-only position
 *     updates) is not a contribution to the communal map. Both are filtered out
 *     (`kind NOT LIKE 'map.%' AND kind <> 'system.moved'`).
 *   - **week/month/year periods** are derived from the weekly rollup by mapping
 *     each ISO week to its Monday's calendar month/year (see period helpers).
 */

export type ActivityStatScope = 'private' | 'corp' | 'alliance';
export type ActivityStatPeriod = 'week' | 'month' | 'year';

export interface ActivityTriplet {
  create: number;
  update: number;
  delete: number;
}

export interface ActivityStatRow {
  /** Account main character id as a string (bigint isn't JSON-safe); `'0'` = unknown. */
  mainCharacterId: string;
  characterName: string;
  /** EVE image-CDN portrait, or `null` for the unknown bucket. */
  portraitUrl: string | null;
  system: ActivityTriplet;
  connection: ActivityTriplet;
  signature: ActivityTriplet;
  /** Sum of the three triplets in the current (selected) period. */
  total: number;
  /** Per-bucket total activity over the trailing window, oldest → newest. */
  series: number[];
}

export interface ActivityStatsResponse {
  rows: ActivityStatRow[];
  /** Human label for the selected period, e.g. `Week 22 · 2026` / `May 2026` / `2026`. */
  label: string;
  /** ISO date (`yyyy-mm-dd`) anchoring the previous period. */
  prevAnchor: string;
  /** ISO date anchoring the next period. */
  nextAnchor: string;
  /** False when the selected period is already the current one (no future to navigate to). */
  hasNext: boolean;
}

/** How many trailing period-buckets the sparkline series spans. */
const SPARK_BUCKETS = 12;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// `kind` → [group, action]. Drives the triplet columns; `map.*` kinds never
// reach here (filtered in SQL). System uses added/updated/removed verbs.
const KIND_MAP: Record<string, [keyof Pick<ActivityStatRow, 'system' | 'connection' | 'signature'>, keyof ActivityTriplet]> = {
  'system.added': ['system', 'create'],
  'system.updated': ['system', 'update'],
  'system.removed': ['system', 'delete'],
  'connection.create': ['connection', 'create'],
  'connection.update': ['connection', 'update'],
  'connection.delete': ['connection', 'delete'],
  'signature.create': ['signature', 'create'],
  'signature.update': ['signature', 'update'],
  'signature.delete': ['signature', 'delete'],
};

interface ActorScopeRow {
  authzLevel: 'member' | 'manager' | 'admin';
  status: 'active' | 'kicked' | 'banned';
  corporationId: bigint | null;
  allianceId: bigint | null;
}

async function loadActorScopes(characterId: bigint): Promise<ActorScopeRow | null> {
  const [row] = await db
    .select({
      authzLevel: apCharacter.authzLevel,
      status: apCharacter.status,
      corporationId: apCharacter.corporationId,
      allianceId: apCharacter.allianceId,
    })
    .from(apCharacter)
    .where(eq(apCharacter.id, characterId));
  return row ?? null;
}

/**
 * Which statistics scope tabs the session may view. Private is always present
 * for an active character; corp/alliance appear when the actor has the
 * respective membership. Admins see all three.
 */
export async function resolveStatsAccess(
  session: Session | null | undefined,
): Promise<ActivityStatScope[]> {
  if (!session?.characterId) return [];
  const actor = await loadActorScopes(BigInt(session.characterId));
  if (!actor || actor.status !== 'active') return [];
  if (actor.authzLevel === 'admin') return ['private', 'corp', 'alliance'];
  const scopes: ActivityStatScope[] = ['private'];
  if (actor.corporationId !== null) scopes.push('corp');
  if (actor.allianceId !== null) scopes.push('alliance');
  return scopes;
}

// --- period math (UTC throughout to avoid host-timezone drift) ---------------

function parseAnchor(anchor: string | undefined): Date {
  if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    const d = new Date(`${anchor}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Normalise a date to the start of its bucket for the given period (UTC midnight). */
function bucketStart(date: Date, period: ActivityStatPeriod): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (period === 'year') return new Date(Date.UTC(y, 0, 1));
  if (period === 'month') return new Date(Date.UTC(y, m, 1));
  // week → Monday of the ISO week.
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(y, m, date.getUTCDate() + offset));
}

/** Shift a normalised bucket start by `n` whole buckets. */
function shiftBucket(start: Date, n: number, period: ActivityStatPeriod): Date {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const d = start.getUTCDate();
  if (period === 'year') return new Date(Date.UTC(y + n, 0, 1));
  if (period === 'month') return new Date(Date.UTC(y, m + n, 1));
  return new Date(Date.UTC(y, m, d + n * 7));
}

/** ISO-8601 week-numbering year + week for a date. */
function isoYearWeek(date: Date): { year: number; week: number } {
  // Thursday of the current week determines the ISO year.
  const thursday = new Date(date);
  const day = (date.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  thursday.setUTCDate(date.getUTCDate() - day + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { year, week };
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatLabel(start: Date, period: ActivityStatPeriod): string {
  if (period === 'year') return String(start.getUTCFullYear());
  if (period === 'month') return `${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  const { year, week } = isoYearWeek(start);
  return `Week ${week} · ${year}`;
}

/** Bucket-equality key for assigning a week-Monday to one of the trailing buckets. */
function bucketKey(date: Date, period: ActivityStatPeriod): string {
  const s = bucketStart(date, period);
  return toISODate(s);
}

type AggRow = {
  main_id: string;
  week_monday: string;
  kind: string;
  total: number;
};

/**
 * Per-character activity for a scope + period. Aggregates the rollup over every
 * map of `scope` the session can view, attributes each row to the account main,
 * and folds the trailing window into the table (current bucket) + sparkline
 * series (all buckets). Returns empty `rows` when the actor sees no such maps.
 */
export async function loadActivityStats(input: {
  session: Session | null | undefined;
  scope: ActivityStatScope;
  period: ActivityStatPeriod;
  anchor?: string;
}): Promise<ActivityStatsResponse> {
  const { session, scope, period } = input;
  const anchorDate = parseAnchor(input.anchor);
  const current = bucketStart(anchorDate, period);
  const windowStart = shiftBucket(current, -(SPARK_BUCKETS - 1), period);
  const nextStart = shiftBucket(current, 1, period);

  // Trailing bucket starts, oldest → newest; current is the last entry.
  const buckets: Date[] = [];
  for (let i = SPARK_BUCKETS - 1; i >= 0; i--) buckets.push(shiftBucket(current, -i, period));
  const bucketIndex = new Map<string, number>();
  buckets.forEach((b, i) => bucketIndex.set(toISODate(b), i));
  const currentIdx = buckets.length - 1;

  const today = new Date();
  const todayBucket = bucketStart(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
    period,
  );
  const hasNext = current.getTime() < todayBucket.getTime();

  const base: Omit<ActivityStatsResponse, 'rows'> = {
    label: formatLabel(current, period),
    prevAnchor: toISODate(shiftBucket(current, -1, period)),
    nextAnchor: toISODate(nextStart),
    hasNext,
  };

  if (!session?.characterId) return { rows: [], ...base };
  const characterId = BigInt(session.characterId);

  const predicate = await viewableMapPredicate(characterId);
  const where =
    predicate === undefined
      ? and(eq(apMap.type, scope), isNull(apMap.deletedAt))
      : and(predicate, eq(apMap.type, scope), isNull(apMap.deletedAt));
  const maps = await db.select({ id: apMap.id }).from(apMap).where(where);
  const mapIds = maps.map((m) => m.id);
  if (mapIds.length === 0) return { rows: [], ...base };

  const idList = sql.join(
    mapIds.map((id) => sql`${id}`),
    sql`, `,
  );

  // Raw SQL: the MV sits outside the Drizzle schema graph (same pattern as
  // `activityRollupRefresh.ts`). The COALESCE chain attributes to the main, then
  // the acting character, then the rollup id (0 = erased).
  const result = await db.execute<AggRow>(sql`
    WITH agg AS (
      SELECT
        COALESCE(u.main_character_id, c.id, r.character_id)::text AS main_id,
        to_date(r.iso_year || '-' || r.iso_week, 'IYYY-IW')        AS week_monday,
        r.kind                                                     AS kind,
        SUM(r.event_count)::int                                    AS total
      FROM ap_activity_rollup r
      LEFT JOIN ap_character c ON c.id = r.character_id
      LEFT JOIN ap_user u ON u.id = c.user_id
      WHERE r.map_id IN (${idList})
        AND r.kind NOT LIKE 'map.%'
        AND r.kind <> 'system.moved'
      GROUP BY 1, 2, 3
    )
    SELECT main_id, to_char(week_monday, 'YYYY-MM-DD') AS week_monday, kind, total
    FROM agg
    WHERE week_monday >= ${toISODate(windowStart)}::date
      AND week_monday <  ${toISODate(nextStart)}::date
  `);

  interface Acc {
    system: ActivityTriplet;
    connection: ActivityTriplet;
    signature: ActivityTriplet;
    total: number;
    series: number[];
  }
  const emptyTriplet = (): ActivityTriplet => ({ create: 0, update: 0, delete: 0 });
  const accById = new Map<string, Acc>();

  for (const row of result.rows) {
    const idx = bucketIndex.get(bucketKey(new Date(`${row.week_monday}T00:00:00Z`), period));
    if (idx === undefined) continue;
    let acc = accById.get(row.main_id);
    if (!acc) {
      acc = {
        system: emptyTriplet(),
        connection: emptyTriplet(),
        signature: emptyTriplet(),
        total: 0,
        series: new Array(SPARK_BUCKETS).fill(0),
      };
      accById.set(row.main_id, acc);
    }
    acc.series[idx] = (acc.series[idx] ?? 0) + row.total;
    if (idx === currentIdx) {
      const mapped = KIND_MAP[row.kind];
      if (mapped) {
        const [group, action] = mapped;
        acc[group][action] += row.total;
        acc.total += row.total;
      }
    }
  }

  // Resolve main-character display names in one query.
  const realIds = [...accById.keys()].filter((id) => id !== '0').map((id) => BigInt(id));
  const nameRows = realIds.length
    ? await db
        .select({ id: apCharacter.id, name: apCharacter.name })
        .from(apCharacter)
        .where(inArray(apCharacter.id, realIds))
    : [];
  const nameById = new Map(nameRows.map((r) => [r.id.toString(), r.name]));

  const rows: ActivityStatRow[] = [...accById.entries()].map(([mainCharacterId, acc]) => ({
    mainCharacterId,
    characterName:
      mainCharacterId === '0'
        ? '(unknown)'
        : (nameById.get(mainCharacterId) ?? `Character ${mainCharacterId}`),
    portraitUrl:
      mainCharacterId === '0'
        ? null
        : `https://images.evetech.net/characters/${mainCharacterId}/portrait?size=64`,
    system: acc.system,
    connection: acc.connection,
    signature: acc.signature,
    total: acc.total,
    series: acc.series,
  }));

  // Rank by current-period total desc; keep zero-current rows (they have a
  // sparkline history) below, ordered by trailing activity.
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const sa = a.series.reduce((s, n) => s + n, 0);
    const sb = b.series.reduce((s, n) => s + n, 0);
    return sb - sa;
  });

  return { rows, ...base };
}
