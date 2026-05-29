// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { encode } from 'next-auth/jwt';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apMap,
  apMapSystem,
  apUser,
  universeConstellation,
  universeRegion,
  universeSystem,
} from '@/db/schema';
import { env } from '@/lib/env';
import { apertureConfig } from '../../aperture.config';
import { attachWsServer } from '@/lib/realtime/wsServer';
import { updateSystem } from '@/lib/map/mutations/systems';
import { mapUpdateLoadSchema, type ServerToClientMessage } from '@/lib/realtime/protocol';

/**
 * Multi-user sync soak (CLAUDE.md "Realtime" robustness investigation).
 *
 * Reproduces the legacy "everybody fights when several people rearrange systems"
 * scenario on the rebuild's pathway: N actors fire concurrent position commits
 * through the real `updateSystem` → `commitMapEvent` → `ap_map_event` →
 * `tg_map_event_notify` → LISTEN bus → WebSocket fan-out, while K observer
 * sockets record every `mapUpdate` they receive. Three properties are asserted:
 *
 *   1. CONVERGENCE — every observer, folding the events it received in arrival
 *      order, lands on the same final position per system as the authoritative
 *      DB row. This is the property the legacy 5s-debounce + full-map-push model
 *      violated; the delta model should satisfy it because pg NOTIFY delivers in
 *      commit order and the row's final value is set by the last committer.
 *
 *   2. NO TRANSPORT DROP — each observer received exactly the set of event ids
 *      committed during the burst (no server-side / socket-level loss under load).
 *      NOTE: this exercises the server→socket transport only. The known
 *      client-layer risk (the React provider's single-slot `lastEvent`
 *      coalescing bursts — see useRealtime.tsx) lives above the socket and is a
 *      separate provider-level test; raw `ws` here does not coalesce.
 *
 *   3. RECONNECT GAP — an observer whose socket drops mid-burst receives NONE of
 *      the events committed while it was disconnected after it reconnects (there
 *      is no "since eventId" backfill today). This test DOCUMENTS the gap; when a
 *      resync-on-reconnect lands, flip the expectation to assert full recovery.
 *
 * DB-gated like the rest of the integration suite:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test realtime-soak
 *
 * Load is env-tunable for ad-hoc soak runs:
 *   SOAK_ACTORS=8 SOAK_OBSERVERS=5 SOAK_MOVES=80 SOAK_SYSTEMS=10 RUN_DB_TESTS=1 pnpm test realtime-soak
 */
const run = process.env.RUN_DB_TESTS === '1';

const ACTORS = Math.max(1, Number(process.env.SOAK_ACTORS ?? 4));
const OBSERVERS = Math.max(1, Number(process.env.SOAK_OBSERVERS ?? 3));
const MOVES_PER_ACTOR = Math.max(1, Number(process.env.SOAK_MOVES ?? 40));
const SYSTEMS = Math.max(2, Number(process.env.SOAK_SYSTEMS ?? 6));

// Budgets scale with the configured load: each commit is a full transaction plus
// the post-commit webhook-EXISTS probe (~tens of ms), so a large burst needs a
// proportionally larger window. The light default stays well under 30s.
const TOTAL_COMMITS = ACTORS * MOVES_PER_ACTOR;
const DRAIN_MS = Math.max(10_000, TOTAL_COMMITS * 30);
const SOAK_TEST_TIMEOUT_MS = TOTAL_COMMITS * 120 + 30_000;

// Synthetic id space, well clear of any ingested SDE rows.
const REGION = 98040000;
const CONSTELLATION = 98040000;
const SYSTEM_BASE = 98040100; // universe_system ids SYSTEM_BASE .. SYSTEM_BASE+SYSTEMS-1
const PRINCIPALS = Math.max(ACTORS, OBSERVERS);
const CHAR_BASE = 98040001n; // ap_character ids CHAR_BASE .. CHAR_BASE+PRINCIPALS-1

const COOKIE_NAME = 'authjs.session-token';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred: () => boolean, ms: number, step = 25): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await delay(step);
  }
  return pred();
}

async function cookieFor(characterId: bigint, userId: number): Promise<string> {
  const token = await encode({
    token: { characterId: characterId.toString(), userId },
    secret: env.AUTH_SECRET,
    salt: COOKIE_NAME,
  });
  return `${COOKIE_NAME}=${token}`;
}

/** A single position observation lifted from a `system.updated` envelope. */
type Move = { eventId: number; id: string; x: number; y: number };

/** A WebSocket client that records every position update it receives, in arrival order. */
class Observer {
  readonly moves: Move[] = [];
  private ws!: WebSocket;

  constructor(
    readonly idx: number,
    private readonly url: string,
    private readonly cookie: string,
  ) {}

  async open(): Promise<void> {
    this.ws = new WebSocket(this.url, { headers: { Cookie: this.cookie } });
    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
      this.ws.once('unexpected-response', (_req, res) =>
        reject(new Error(`HTTP ${res.statusCode}`)),
      );
    });
    this.ws.on('message', (raw) => this.ingest(raw.toString()));
  }

  private ingest(raw: string): void {
    const msg = JSON.parse(raw) as ServerToClientMessage;
    if (msg.task !== 'mapUpdate') return;
    const parsed = mapUpdateLoadSchema.safeParse(msg.load);
    if (!parsed.success || !parsed.data.data) return;
    const data = parsed.data.data;
    if (data.kind !== 'system.updated') return;
    if (data.positionX === undefined || data.positionY === undefined) return;
    this.moves.push({ eventId: data.eventId, id: data.id, x: data.positionX, y: data.positionY });
  }

  subscribe(mapId: bigint): void {
    this.ws.send(JSON.stringify({ task: 'subscribe', load: { mapIds: [Number(mapId)] } }));
  }

  /** Distinct event ids this observer has seen. */
  eventIds(): Set<number> {
    return new Set(this.moves.map((m) => m.eventId));
  }

  /** Final position per system, folding arrivals in order (last write wins). */
  reconstruct(): Map<string, { x: number; y: number }> {
    const state = new Map<string, { x: number; y: number }>();
    for (const m of this.moves) state.set(m.id, { x: m.x, y: m.y });
    return state;
  }

  close(): void {
    this.ws.close();
  }
}

describe.skipIf(!run)('realtime multi-user soak (convergence / drop / reconnect)', () => {
  let server: Server;
  let wsUrl: string;
  let mapId: bigint;
  const charIds: bigint[] = [];
  const cookies: string[] = [];
  /** `ap_map_system.id` per synthetic system, in SYSTEM_BASE order. */
  const mapSystemIds: bigint[] = [];
  const liveObservers: Observer[] = [];

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    // --- Static universe geography (minimal: position updates need no statics) ---
    await db.insert(universeRegion).values({ id: REGION, name: 'Soak Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Soak Const' });
    await db.insert(universeSystem).values(
      Array.from({ length: SYSTEMS }, (_, i) => ({
        id: SYSTEM_BASE + i,
        constellationId: CONSTELLATION,
        name: `J${900000 + i}`,
        security: 'C3' as const,
      })),
    );

    // --- Mock principals: one user + admin character each. Admin authz makes
    // every principal able to view AND mutate the shared map regardless of
    // ownership (rights.ts admin override), so the soak exercises sync, not authz.
    const users = await db
      .insert(apUser)
      .values(Array.from({ length: PRINCIPALS }, () => ({})))
      .returning({ id: apUser.id });
    await db.insert(apCharacter).values(
      users.map((u, i) => ({
        id: CHAR_BASE + BigInt(i),
        userId: u.id,
        name: `Soak Pilot ${i}`,
        ownerHash: `soak-owner-${i}`,
        status: 'active' as const,
        authzLevel: 'admin' as const,
      })),
    );
    for (let i = 0; i < PRINCIPALS; i++) {
      const cid = CHAR_BASE + BigInt(i);
      charIds.push(cid);
      cookies.push(await cookieFor(cid, users[i]!.id));
    }

    // --- Shared private map owned by char[0] (satisfies the single-owner CHECK) ---
    const [map] = await db
      .insert(apMap)
      .values({
        scope: 'all',
        type: 'private',
        name: 'Soak Map',
        ownerCharacterId: charIds[0]!,
      })
      .returning({ id: apMap.id });
    mapId = map!.id;

    // --- Place the systems on the map at a known origin ---
    const rows = await db
      .insert(apMapSystem)
      .values(
        Array.from({ length: SYSTEMS }, (_, i) => ({
          mapId,
          systemId: SYSTEM_BASE + i,
          visible: true,
          positionX: 0,
          positionY: 0,
        })),
      )
      .returning({ id: apMapSystem.id, systemId: apMapSystem.systemId });
    rows.sort((a, b) => a.systemId - b.systemId);
    for (const r of rows) mapSystemIds.push(r.id);

    // --- WS server on a bare HTTP server (mirrors realtime-transport.test.ts) ---
    server = createServer();
    attachWsServer(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${port}${apertureConfig.WS_PATH}`;
  }, 60_000);

  afterAll(async () => {
    for (const o of liveObservers) o.close();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
    await pool.end();
  });

  async function maxEventId(): Promise<number> {
    const rows = (
      await db.execute(
        sql`SELECT COALESCE(MAX(id), 0)::bigint AS id FROM ap_map_event WHERE map_id = ${mapId}`,
      )
    ).rows as Array<{ id: string }>;
    return Number(rows[0]!.id);
  }

  async function committedUpdateIdsSince(baseline: number): Promise<Set<number>> {
    const rows = (
      await db.execute(
        sql`SELECT id::bigint AS id FROM ap_map_event
            WHERE map_id = ${mapId} AND kind = 'system.updated' AND id > ${baseline}`,
      )
    ).rows as Array<{ id: string }>;
    return new Set(rows.map((r) => Number(r.id)));
  }

  /** One actor's sequential burst; actors run concurrently via Promise.all. */
  async function actorBurst(actorIdx: number): Promise<void> {
    const char = charIds[actorIdx]!;
    for (let m = 0; m < MOVES_PER_ACTOR; m++) {
      // Overlapping target systems across actors → genuine same-row contention.
      const sysIdx = (actorIdx + m) % SYSTEMS;
      const result = await updateSystem({
        mapId,
        mapSystemId: mapSystemIds[sysIdx]!,
        characterId: char,
        // Encodes which actor+move won, so a divergence is legible in the diff.
        patch: { positionX: actorIdx * 100000 + m, positionY: actorIdx * 200000 + m },
      });
      expect(result.ok).toBe(true);
    }
  }

  it('all observers converge to the DB state with no transport drops under concurrent edits', async () => {
    const observers = cookies
      .slice(0, OBSERVERS)
      .map((cookie, i) => new Observer(i, wsUrl, cookie));
    for (const o of observers) {
      await o.open();
      liveObservers.push(o);
      o.subscribe(mapId);
    }
    await delay(250); // let every LISTEN register before the first commit

    const baseline = await maxEventId();
    await Promise.all(Array.from({ length: ACTORS }, (_, i) => actorBurst(i)));
    const committed = await committedUpdateIdsSince(baseline);
    expect(committed.size).toBe(ACTORS * MOVES_PER_ACTOR);

    // Wait for every observer to drain to the committed count (or time out).
    await waitFor(() => observers.every((o) => o.eventIds().size >= committed.size), DRAIN_MS);

    // Authoritative final state.
    const dbRows = await db
      .select({ id: apMapSystem.id, x: apMapSystem.positionX, y: apMapSystem.positionY })
      .from(apMapSystem)
      .where(eq(apMapSystem.mapId, mapId));
    const truth = new Map(dbRows.map((r) => [r.id.toString(), { x: r.x, y: r.y }]));

    for (const o of observers) {
      // (2) No transport drop: exactly the committed id set, nothing missing/extra.
      expect(o.eventIds()).toEqual(committed);
      // (1) Convergence: folded final state equals the DB row for every system.
      const reconstructed = o.reconstruct();
      for (const sysId of mapSystemIds) {
        expect(reconstructed.get(sysId.toString())).toEqual(truth.get(sysId.toString()));
      }
    }
  }, SOAK_TEST_TIMEOUT_MS);

  it('documents the reconnect gap: events committed while a socket is down are never backfilled', async () => {
    const obs = new Observer(99, wsUrl, cookies[0]!);
    await obs.open();
    liveObservers.push(obs);
    obs.subscribe(mapId);
    await delay(250);

    // Phase 1 — one commit the observer is present for.
    const before1 = await maxEventId();
    await updateSystem({
      mapId,
      mapSystemId: mapSystemIds[0]!,
      characterId: charIds[0]!,
      patch: { positionX: 11, positionY: 11 },
    });
    await waitFor(() => obs.moves.some((m) => m.eventId > before1), 5_000);

    // Phase 2 — drop the socket, then commit a batch while it is disconnected.
    obs.close();
    await delay(150);
    const gapIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await updateSystem({
        mapId,
        mapSystemId: mapSystemIds[i % SYSTEMS]!,
        characterId: charIds[0]!,
        patch: { positionX: 500 + i, positionY: 500 + i },
      });
      expect(r.ok).toBe(true);
      if (r.ok) gapIds.push(r.eventId);
    }

    // Phase 3 — reconnect and resubscribe; commit one more the observer is present for.
    const reconnected = new Observer(98, wsUrl, cookies[0]!);
    await reconnected.open();
    liveObservers.push(reconnected);
    reconnected.subscribe(mapId);
    await delay(250);
    const r = await updateSystem({
      mapId,
      mapSystemId: mapSystemIds[0]!,
      characterId: charIds[0]!,
      patch: { positionX: 999, positionY: 999 },
    });
    expect(r.ok).toBe(true);
    const tailId = r.ok ? r.eventId : -1;
    await waitFor(() => reconnected.eventIds().has(tailId), 5_000);

    // The reconnected socket sees post-reconnect events but NONE of the gap batch:
    // there is no replay/backfill of what was missed while disconnected.
    const seen = reconnected.eventIds();
    expect(seen.has(tailId)).toBe(true);
    for (const gapId of gapIds) expect(seen.has(gapId)).toBe(false);
  }, 30_000);

  async function cleanup(): Promise<void> {
    // Map deleted first: its cascade clears ap_map_system + ap_map_event, freeing
    // the universe_system RESTRICT FK. Then drop each mock user by the fixed
    // character id (cascade removes the character) — this also reaps any rows a
    // prior soak run leaked. Universe geography goes last.
    await db.delete(apMap).where(eq(apMap.name, 'Soak Map'));
    for (let i = 0; i < PRINCIPALS; i++) {
      const [row] = await db
        .select({ userId: apCharacter.userId })
        .from(apCharacter)
        .where(eq(apCharacter.id, CHAR_BASE + BigInt(i)));
      if (row) await db.delete(apUser).where(eq(apUser.id, row.userId));
    }
    await db.delete(universeSystem).where(eq(universeSystem.constellationId, CONSTELLATION));
    await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
    await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
  }
});
