import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { decode } from 'next-auth/jwt';
import { and, inArray, isNull } from 'drizzle-orm';
import { env } from '@/lib/env';
import { apertureConfig } from '../../../aperture.config';
import { db } from '@/db/client';
import { apMap } from '@/db/schema';
import { startTrackingCharacter } from '@/lib/jobs/tracking';
import { bus } from './bus';
import { clientToServerMessageSchema, type ServerToClientMessage } from './protocol';

/**
 * Node-runtime WebSocket server attached to the same HTTP server as Next.js
 * (SPEC §5.5). Broadcast-only: clients send `subscribe` / `unsubscribe`; the
 * server fans `mapUpdate` envelopes sourced from the Postgres LISTEN bus.
 *
 * Authorization is the Auth.js session, read off the upgrade request's cookies.
 * INTERIM ACCESS (Stage 8): any logged-in character may subscribe to any
 * non-soft-deleted map — same policy as `loadMapForView`. Per-map rights land
 * in Stage 15.
 */

type SessionClaims = { userId: number; characterId: string };

type ClientState = {
  session: SessionClaims;
  isAlive: boolean;
  /** mapId → bus unsubscribe fn. */
  subscriptions: Map<bigint, () => void>;
};

// Auth.js v5 session-cookie names. The salt passed to `decode` is the cookie
// name itself (v5 derives the encryption key from secret + salt).
const COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
] as const;

function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out.set(name, decodeURIComponent(value));
  }
  return out;
}

async function resolveSession(req: IncomingMessage): Promise<SessionClaims | null> {
  if (!env.AUTH_SECRET) return null;
  const cookies = parseCookies(req.headers.cookie);
  for (const name of COOKIE_NAMES) {
    const token = cookies.get(name);
    if (!token) continue;
    try {
      const claims = await decode({ token, secret: env.AUTH_SECRET, salt: name });
      if (claims?.characterId && claims.userId != null) {
        return { userId: claims.userId, characterId: claims.characterId };
      }
    } catch {
      // Try the next cookie name; fall through to reject.
    }
  }
  return null;
}

function send(socket: WebSocket, message: ServerToClientMessage): void {
  console.log('Sending message to client:', message);
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

/** Map ids from the request that exist and are not soft-deleted. */
async function existingMapIds(mapIds: number[]): Promise<Set<bigint>> {
  if (mapIds.length === 0) return new Set();
  const rows = await db
    .select({ id: apMap.id })
    .from(apMap)
    .where(and(inArray(apMap.id, mapIds.map(BigInt)), isNull(apMap.deletedAt)));
  return new Set(rows.map((r) => r.id));
}

let attached = false;

export function attachWsServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, ClientState>();

  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '', 'http://localhost');
    if (pathname !== apertureConfig.WS_PATH) return; // not ours — leave for Next/HMR.

    void resolveSession(req).then((session) => {
      if (!session) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, session);
      });
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, session: SessionClaims) => {
    const state: ClientState = { session, isAlive: true, subscriptions: new Map() };
    clients.set(ws, state);

    ws.on('pong', () => {
      state.isAlive = true;
    });

    ws.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return; // drop malformed frame
      }
      const result = clientToServerMessageSchema.safeParse(parsed);
      if (!result.success) return;

      const { task, load } = result.data;
      if (task === 'subscribe') {
        void subscribe(ws, state, load.mapIds);
      } else {
        unsubscribe(state, load.mapIds);
      }
    });

    ws.on('close', () => {
      for (const off of state.subscriptions.values()) off();
      state.subscriptions.clear();
      clients.delete(ws);
    });
  });

  async function subscribe(ws: WebSocket, state: ClientState, mapIds: number[]): Promise<void> {
    const allowed = await existingMapIds(mapIds);
    const characterId = BigInt(state.session.characterId);
    for (const id of allowed) {
      if (!state.subscriptions.has(id)) {
        const off = bus.subscribe(id, (message) => send(ws, message));
        state.subscriptions.set(id, off);
      }
      // Start server-side tracking for this character on this map. Idempotent —
      // safe to call on every subscribe (re-subscribe after reconnect, multiple
      // tabs). Tracking survives tab close by design; stop is an explicit user
      // action (Stage 15 tracking toggle).
      void startTrackingCharacter({ mapId: id, characterId });
    }
  }

  function unsubscribe(state: ClientState, mapIds: number[]): void {
    for (const raw of mapIds) {
      const id = BigInt(raw);
      const off = state.subscriptions.get(id);
      if (off) {
        off();
        state.subscriptions.delete(id);
      }
    }
  }

  // Heartbeat: ws ping for transport liveness + an app-level healthCheck so the
  // client clears its degraded banner even on a quiet map.
  const heartbeat = setInterval(() => {
    for (const [ws, state] of clients) {
      if (!state.isAlive) {
        ws.terminate();
        continue;
      }
      state.isAlive = false;
      ws.ping();
      send(ws, { task: 'healthCheck', load: { ts: Date.now(), ok: true } });
    }
  }, apertureConfig.WS_HEARTBEAT_MS);
  heartbeat.unref?.();

  wss.on('close', () => clearInterval(heartbeat));
  attached = true;
  return wss;
}

/** Whether {@link attachWsServer} has run in this process. Exposed for tests/health. */
export function isWsServerAttached(): boolean {
  return attached;
}
