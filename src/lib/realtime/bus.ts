import { Client } from 'pg';
import { env } from '@/lib/env';
import { apertureConfig } from '../../../aperture.config';
import type { ServerToClientMessage } from './protocol';

/**
 * Server-side Postgres LISTEN multiplexer — the read end of the §6.5 realtime
 * pipeline. The `tg_map_event_notify` trigger fires
 * `pg_notify('map:'||map_id, payload)` on every `ap_map_event` insert; this
 * module holds ONE dedicated `pg` Client (LISTEN occupies a connection, so it
 * must not borrow from the pooled `db`), reference-counts channel subscriptions,
 * and wraps each notification into a broadcast-only `mapUpdate` envelope.
 *
 * The WebSocket server (wsServer.ts) is the only consumer; clients never reach
 * this directly. Channel naming and the envelope shape come from the rebuild's
 * operational need (protocol.ts), not legacy payload shapes.
 */

type Listener = (message: ServerToClientMessage) => void;

const PREFIX = apertureConfig.MAP_EVENT_NOTIFY_CHANNEL_PREFIX;

class RealtimeBus {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  /** mapId → set of listeners. The set's presence drives LISTEN/UNLISTEN. */
  private readonly listeners = new Map<bigint, Set<Listener>>();

  /** Subscribe to a map's events. Returns an unsubscribe function. */
  subscribe(mapId: bigint, listener: Listener): () => void {
    let set = this.listeners.get(mapId);
    const isFirst = !set;
    if (!set) {
      set = new Set();
      this.listeners.set(mapId, set);
    }
    set.add(listener);

    if (isFirst) void this.listen(mapId);
    void this.ensureConnected();

    return () => {
      const current = this.listeners.get(mapId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(mapId);
        void this.unlisten(mapId);
      }
    };
  }

  /** Whether the dedicated LISTEN connection is currently live. */
  isHealthy(): boolean {
    return this.connected;
  }

  private channel(mapId: bigint): string {
    return `${PREFIX}${mapId.toString()}`;
  }

  /** Quote a notify channel as a SQL identifier (channels contain a colon). */
  private quoted(mapId: bigint): string {
    return `"${this.channel(mapId).replace(/"/g, '""')}"`;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;

    const client = new Client({ connectionString: env.DATABASE_URL });
    this.client = client;
    client.on('notification', (msg) => this.dispatch(msg.channel, msg.payload));
    client.on('error', () => this.handleDrop());
    client.on('end', () => this.handleDrop());

    this.connecting = client
      .connect()
      .then(async () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        // Re-issue LISTEN for every channel that still has listeners (covers
        // both first connect and reconnect after a drop).
        for (const mapId of this.listeners.keys()) {
          await client.query(`LISTEN ${this.quoted(mapId)}`);
        }
      })
      .catch(() => this.handleDrop())
      .finally(() => {
        this.connecting = null;
      });

    return this.connecting;
  }

  private async listen(mapId: bigint): Promise<void> {
    await this.ensureConnected();
    if (this.connected && this.client) {
      try {
        await this.client.query(`LISTEN ${this.quoted(mapId)}`);
      } catch {
        this.handleDrop();
      }
    }
  }

  private async unlisten(mapId: bigint): Promise<void> {
    if (this.connected && this.client) {
      try {
        await this.client.query(`UNLISTEN ${this.quoted(mapId)}`);
      } catch {
        // Best-effort; a drop will UNLISTEN implicitly.
      }
    }
  }

  private handleDrop(): void {
    if (!this.connected && !this.client) return;
    this.connected = false;
    const old = this.client;
    this.client = null;
    if (old) old.end().catch(() => {});

    // Only bother reconnecting if something still wants events.
    if (this.listeners.size === 0) return;
    if (this.reconnectTimer) return;

    const delay = Math.min(
      apertureConfig.WS_RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
      apertureConfig.WS_RECONNECT_MAX_MS,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected();
    }, delay);
  }

  private dispatch(channel: string, raw: string | undefined): void {
    if (!channel.startsWith(PREFIX)) return;
    const mapId = BigInt(channel.slice(PREFIX.length));
    const set = this.listeners.get(mapId);
    if (!set || set.size === 0) return;

    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    const kind =
      data && typeof data === 'object' && typeof (data as { kind?: unknown }).kind === 'string'
        ? (data as { kind: string }).kind
        : undefined;

    const message: ServerToClientMessage = {
      task: 'mapUpdate',
      load: { mapId: Number(mapId), kind, data },
    };

    for (const listener of set) {
      try {
        listener(message);
      } catch {
        // A misbehaving listener must not stall fan-out to the others.
      }
    }
  }
}

declare global {
  var __apertureRealtimeBus: RealtimeBus | undefined;
}

export const bus = globalThis.__apertureRealtimeBus ?? new RealtimeBus();

if (env.NODE_ENV !== 'production') {
  globalThis.__apertureRealtimeBus = bus;
}

export type { Listener };
