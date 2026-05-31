import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apertureConfig } from '../../../aperture.config';
import { db } from '@/db/client';
import { apMap, apMapSystem } from '@/db/schema';
import type { SystemNotificationLoad } from '@/lib/realtime/protocol';
import { zkbKillSchema, type ZkbKill } from './zkb';

/**
 * Server-side zKillboard live-feed consumer (Stage 17.8 follow-up). A single
 * long-lived loop — booted from `server.ts`, not graphile-worker (this is one
 * global feed, not per-entity work) — polls zKillboard's **R2Z2** ephemeral
 * sequence feed and, for every kill in a solar system that is currently on an
 * active map, fans a transient `systemNotification` to that map's subscribers.
 *
 * The notification carries no map state, so (like the location-poll's
 * `characterUpdate`) it is a direct `pg_notify` that **bypasses `ap_map_event`**
 * — the bus discriminates on the top-level `task` field. Clients pulse a red
 * "underglow" under the node (`MapUnderglowBridge`).
 *
 * R2Z2 (the RedisQ replacement): walk `<base>/<seq>.json` upward from a cursor
 * until a 404 (caught up), sleep ≥6s, repeat. The cursor starts at the feed's
 * current sequence on boot — we surface kills happening *now*, never backfill.
 */

const BASE = apertureConfig.ZKB_R2Z2_BASE;
const ZKB_KILL_URL = 'https://zkillboard.com/kill';

const sequenceSchema = z.object({ sequence: z.number().int().nonnegative() });

/** EVE solar-system id → the active maps it currently appears on. */
export type SystemIndex = Map<number, Set<bigint>>;

interface FeedState {
  running: boolean;
  /** Last consumed R2Z2 sequence id; null until the first sweep seeds it live. */
  cursor: number | null;
  index: SystemIndex;
  indexBuiltAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  abort: AbortController | null;
  backoffAttempts: number;
}

function freshState(): FeedState {
  return {
    running: false,
    cursor: null,
    index: new Map(),
    indexBuiltAt: 0,
    timer: null,
    abort: null,
    backoffAttempts: 0,
  };
}

let state: FeedState = freshState();

/** Thrown when R2Z2 rate-limits us (429); the loop backs off rather than hammering. */
class ZkbFeedRateLimitError extends Error {
  constructor() {
    super('zKillboard R2Z2 rate limit reached');
    this.name = 'ZkbFeedRateLimitError';
  }
}

/**
 * Rebuild the `solarSystemId → mapIds` index from every visible system on a
 * live (non-soft-deleted) map. One query; the same predicate shape as the
 * location-poll's tracked-map lookup.
 */
export async function loadActiveSystemIndex(): Promise<SystemIndex> {
  const rows = await db
    .select({ systemId: apMapSystem.systemId, mapId: apMapSystem.mapId })
    .from(apMapSystem)
    .innerJoin(apMap, eq(apMap.id, apMapSystem.mapId))
    .where(and(eq(apMapSystem.visible, true), isNull(apMap.deletedAt)));

  const index: SystemIndex = new Map();
  for (const row of rows) {
    let set = index.get(row.systemId);
    if (!set) {
      set = new Set();
      index.set(row.systemId, set);
    }
    set.add(row.mapId);
  }
  return index;
}

/**
 * Map one decoded killmail to the notifications it should fan out — one per
 * active map that has the kill's solar system visible. Returns `[]` when the
 * kill has no system or no map is watching it. Pure; the unit of correlation.
 */
export function correlateKill(kill: ZkbKill, index: SystemIndex): SystemNotificationLoad[] {
  const systemId = kill.solar_system_id;
  if (systemId === undefined) return [];
  const mapIds = index.get(systemId);
  if (!mapIds || mapIds.size === 0) return [];

  const killmail = {
    killmailId: kill.killmail_id,
    shipTypeId: kill.victim?.ship_type_id ?? null,
    totalValue: kill.zkb?.totalValue ?? null,
    href: `${ZKB_KILL_URL}/${kill.killmail_id}/`,
  };

  const out: SystemNotificationLoad[] = [];
  for (const mapId of mapIds) {
    out.push({ mapId: Number(mapId), systemId, kind: 'killmail', killmail });
  }
  return out;
}

async function notify(load: SystemNotificationLoad): Promise<void> {
  const channel = `${apertureConfig.MAP_EVENT_NOTIFY_CHANNEL_PREFIX}${load.mapId}`;
  const envelope = JSON.stringify({ task: 'systemNotification', load });
  await db.execute(sql`SELECT pg_notify(${channel}, ${envelope})`);
}

/**
 * R2Z2 returns the ESI killmail with a `zkb` block. The historical RedisQ
 * `{ package: { killmail, zkb } }` nesting is handled defensively so a feed
 * shape change degrades to "no notification", never a crash.
 */
function decodeKill(raw: unknown): ZkbKill | null {
  const flat = zkbKillSchema.safeParse(raw);
  if (flat.success && flat.data.solar_system_id !== undefined) return flat.data;

  if (raw && typeof raw === 'object' && 'killmail' in raw) {
    const inner = (raw as { killmail?: unknown }).killmail;
    if (inner && typeof inner === 'object') {
      const merged = zkbKillSchema.safeParse({
        ...(inner as object),
        zkb: (raw as { zkb?: unknown }).zkb,
      });
      if (merged.success) return merged.data;
    }
  }
  return flat.success ? flat.data : null;
}

async function fetchJson(url: string, signal: AbortSignal): Promise<{ status: number; body: unknown }> {
  // Per-request timeout, plus the loop's stop signal — whichever fires first.
  const timeout = AbortSignal.timeout(apertureConfig.INTEGRATION_REQUEST_TIMEOUT_MS);
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': apertureConfig.INTEGRATION_USER_AGENT },
    signal: AbortSignal.any([signal, timeout]),
  });
  if (res.status === 404) return { status: 404, body: null };
  if (res.status === 429) throw new ZkbFeedRateLimitError();
  if (!res.ok) return { status: res.status, body: null };
  return { status: 200, body: await res.json() };
}

async function refreshIndexIfStale(signal: AbortSignal): Promise<void> {
  void signal; // DB query is not abortable; kept symmetric with fetch calls.
  const age = Date.now() - state.indexBuiltAt;
  if (state.indexBuiltAt !== 0 && age < apertureConfig.ZKB_FEED_INDEX_REFRESH_MS) return;
  state.index = await loadActiveSystemIndex();
  state.indexBuiltAt = Date.now();
}

interface PollResult {
  processed: number;
  notified: number;
  cursor: number | null;
}

/**
 * One feed sweep. Seeds the cursor live on first call (no backfill); otherwise
 * walks `cursor+1 …` until a 404 (caught up) or the per-tick catch-up cap.
 * Refreshes the active-system index when stale. Exported for the loop and tests.
 */
export async function pollOnce(): Promise<PollResult> {
  const controller = new AbortController();
  state.abort = controller;
  const signal = controller.signal;
  try {
    await refreshIndexIfStale(signal);

    if (state.cursor === null) {
      const { body } = await fetchJson(`${BASE}/sequence.json`, signal);
      const parsed = sequenceSchema.safeParse(body);
      state.cursor = parsed.success ? parsed.data.sequence : 0;
      return { processed: 0, notified: 0, cursor: state.cursor };
    }

    let processed = 0;
    let notified = 0;
    let cursor: number = state.cursor;
    for (let i = 0; i < apertureConfig.ZKB_FEED_MAX_CATCHUP; i++) {
      const seq = cursor + 1;
      const { status, body } = await fetchJson(`${BASE}/${seq}.json`, signal);
      if (status === 404) break; // caught up — retry this seq next tick
      if (status !== 200) break; // transient upstream error — try again next tick
      cursor = seq;
      state.cursor = seq;
      processed++;
      const kill = decodeKill(body);
      if (!kill) continue;
      for (const load of correlateKill(kill, state.index)) {
        await notify(load);
        notified++;
      }
    }
    return { processed, notified, cursor };
  } finally {
    state.abort = null;
  }
}

function scheduleNext(delayMs: number): void {
  if (!state.running) return;
  state.timer = setTimeout(() => void loop(), delayMs);
}

async function loop(): Promise<void> {
  if (!state.running) return;
  try {
    await pollOnce();
    state.backoffAttempts = 0;
    scheduleNext(apertureConfig.ZKB_FEED_POLL_MS);
  } catch {
    // Never let a bad tick kill the loop — back off and try again. Backoff is
    // floored at the normal poll cadence and capped at the WS reconnect ceiling.
    const backoff = Math.min(
      apertureConfig.WS_RECONNECT_MAX_MS,
      apertureConfig.WS_RECONNECT_BASE_MS * 2 ** state.backoffAttempts,
    );
    state.backoffAttempts++;
    scheduleNext(Math.max(apertureConfig.ZKB_FEED_POLL_MS, backoff));
  }
}

/** Start the feed loop. Idempotent — a second call while running is a no-op. */
export function startZkbFeed(): void {
  if (state.running) return;
  state.running = true;
  state.backoffAttempts = 0;
  void loop();
}

/** Stop the feed loop: clear the pending tick and abort any in-flight fetch. */
export async function stopZkbFeed(): Promise<void> {
  state.running = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.abort?.abort();
  state.abort = null;
}

/** Test seam: reset module state between cases. */
export function __resetZkbFeedState(): void {
  state = freshState();
}
