'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { MapConnectionEdge, MapSystemNode } from '@/lib/map/loadMap';
import { useTraversals } from './MapPresenceContext';

// Transient per-edge "a pilot just jumped across this connection" state, keyed
// by connection id. Mirrors `MapPresenceContext`'s external-store shape so each
// `ConnectionEdge` subscribes only to its own slice via `useSyncExternalStore`
// — a single jump re-renders one edge, not the whole edges array (jumps are
// frequent). The actual animation lives in `ConnectionEdge`; this store only
// tells it *which* edge, *which* direction, and carries a token so a rapid
// re-jump restarts the SMIL animation.

const TRAVEL_PULSE_MS = 1300;

export type TravelPulse = {
  /** `forward` = origin is the connection's `source`; `reverse` = origin is `target`. */
  direction: 'forward' | 'reverse';
  /** Monotonic id; bumping it (via React `key`) restarts the edge animation. */
  token: number;
};

type Subscriber = () => void;

class TravelStore {
  private byConnection = new Map<string, TravelPulse>();
  private subs = new Map<string, Set<Subscriber>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextToken = 1;

  pulse(connectionId: string, direction: TravelPulse['direction']): void {
    const token = this.nextToken++;
    this.byConnection.set(connectionId, { direction, token });
    const existing = this.timers.get(connectionId);
    if (existing) clearTimeout(existing);
    this.timers.set(
      connectionId,
      setTimeout(() => {
        // Only clear if no newer pulse replaced this one in the meantime.
        if (this.byConnection.get(connectionId)?.token === token) {
          this.byConnection.delete(connectionId);
          this.timers.delete(connectionId);
          this.notify(connectionId);
        }
      }, TRAVEL_PULSE_MS),
    );
    this.notify(connectionId);
  }

  subscribe(connectionId: string, sub: Subscriber): () => void {
    let set = this.subs.get(connectionId);
    if (!set) {
      set = new Set();
      this.subs.set(connectionId, set);
    }
    set.add(sub);
    return () => {
      const s = this.subs.get(connectionId);
      if (!s) return;
      s.delete(sub);
      if (s.size === 0) this.subs.delete(connectionId);
    };
  }

  getForConnection(connectionId: string): TravelPulse | null {
    return this.byConnection.get(connectionId) ?? null;
  }

  private notify(connectionId: string): void {
    const set = this.subs.get(connectionId);
    if (!set) return;
    for (const sub of set) sub();
  }
}

const TravelContext = createContext<TravelStore | null>(null);

export function MapTravelProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new TravelStore());
  return <TravelContext.Provider value={store}>{children}</TravelContext.Provider>;
}

/**
 * The current pulse for one connection, or `null`. Stable reference until that
 * connection's pulse starts or clears, so the edge only re-renders on its own
 * traversals.
 */
export function useTravelForConnection(connectionId: string): TravelPulse | null {
  const store = useContext(TravelContext);
  const subscribe = useCallback(
    (cb: () => void) => store?.subscribe(connectionId, cb) ?? (() => {}),
    [store, connectionId],
  );
  const getSnapshot = useCallback(
    () => store?.getForConnection(connectionId) ?? null,
    [store, connectionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * Listens for pilot jumps and resolves each to a map edge + direction, then
 * pulses the travel store. Renders nothing. Mounted only when the account has
 * the travel animation enabled — when absent, no pulse ever fires. Lives inside
 * both `MapPresenceProvider` and `MapTravelProvider`.
 *
 * Presence is keyed by EVE solar-system id; edges by `ap_map_system.id`. We map
 * the former to the latter via `systems` (`systemId` → `id`), then match the
 * jump's endpoints against each connection in either direction. `systems` /
 * `connections` are read through refs so the subscription never churns.
 */
export function TravelBridge({
  systems,
  connections,
}: {
  systems: MapSystemNode[];
  connections: MapConnectionEdge[];
}) {
  const systemsRef = useRef(systems);
  const connectionsRef = useRef(connections);
  useEffect(() => {
    systemsRef.current = systems;
    connectionsRef.current = connections;
  });

  const store = useContext(TravelContext);

  useTraversals((t) => {
    if (!store) return;
    const solarToMapSystem = new Map<number, string>();
    for (const s of systemsRef.current) solarToMapSystem.set(s.systemId, s.id);
    const fromId = solarToMapSystem.get(t.fromSystemId);
    const toId = solarToMapSystem.get(t.toSystemId);
    if (fromId === undefined || toId === undefined) return;

    for (const c of connectionsRef.current) {
      if (c.source === fromId && c.target === toId) {
        store.pulse(c.id, 'forward');
      } else if (c.source === toId && c.target === fromId) {
        store.pulse(c.id, 'reverse');
      }
    }
  });

  return null;
}
