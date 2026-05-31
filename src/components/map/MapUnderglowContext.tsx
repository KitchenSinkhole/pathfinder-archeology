'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { UnderglowConfig } from '@/types';

// Transient per-node "underglow" state, keyed by `ap_map_system.id`. Mirrors
// `MapTravelContext`'s external-store shape so each `SystemNode` subscribes only
// to its own slice via `useSyncExternalStore` — one killmail re-renders one
// node, not the whole nodes array. The store holds *which* node, *which* visual
// config, and a monotonic token so a rapid re-trigger restarts the CSS
// animation (bumped via React `key`). The animation itself lives in
// `SystemUnderglow`; the producer side is `MapUnderglowBridge`.
//
// Versatile by construction: the store carries an arbitrary `UnderglowConfig`,
// so killmail (red, transient) and future rally/unscanned-signature glows
// (their own colors; `durationMs: 0` for persistent-until-cleared) all flow
// through the same `trigger`/`clear` API.

export type ActiveUnderglow = {
  config: UnderglowConfig;
  /** Monotonic id; bumping it (via React `key`) restarts the node animation. */
  token: number;
};

type Subscriber = () => void;

class UnderglowStore {
  private bySystem = new Map<string, ActiveUnderglow>();
  private subs = new Map<string, Set<Subscriber>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextToken = 1;

  /** Start (or restart) an underglow on a node. `durationMs: 0` ⇒ persistent. */
  trigger(mapSystemId: string, config: UnderglowConfig): void {
    const token = this.nextToken++;
    this.bySystem.set(mapSystemId, { config, token });

    const existing = this.timers.get(mapSystemId);
    if (existing) clearTimeout(existing);
    this.timers.delete(mapSystemId);

    if (config.durationMs > 0) {
      this.timers.set(
        mapSystemId,
        setTimeout(() => {
          // Only clear if no newer trigger replaced this one in the meantime.
          if (this.bySystem.get(mapSystemId)?.token === token) {
            this.bySystem.delete(mapSystemId);
            this.timers.delete(mapSystemId);
            this.notify(mapSystemId);
          }
        }, config.durationMs),
      );
    }
    this.notify(mapSystemId);
  }

  /** Remove a persistent (or in-flight) underglow from a node. */
  clear(mapSystemId: string): void {
    const existing = this.timers.get(mapSystemId);
    if (existing) clearTimeout(existing);
    this.timers.delete(mapSystemId);
    if (this.bySystem.delete(mapSystemId)) this.notify(mapSystemId);
  }

  subscribe(mapSystemId: string, sub: Subscriber): () => void {
    let set = this.subs.get(mapSystemId);
    if (!set) {
      set = new Set();
      this.subs.set(mapSystemId, set);
    }
    set.add(sub);
    return () => {
      const s = this.subs.get(mapSystemId);
      if (!s) return;
      s.delete(sub);
      if (s.size === 0) this.subs.delete(mapSystemId);
    };
  }

  getForSystem(mapSystemId: string): ActiveUnderglow | null {
    return this.bySystem.get(mapSystemId) ?? null;
  }

  private notify(mapSystemId: string): void {
    const set = this.subs.get(mapSystemId);
    if (!set) return;
    for (const sub of set) sub();
  }
}

const UnderglowContext = createContext<UnderglowStore | null>(null);

export function MapUnderglowProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new UnderglowStore());
  return <UnderglowContext.Provider value={store}>{children}</UnderglowContext.Provider>;
}

/** The producer side reaches the store directly to call `trigger`/`clear`. */
export function useUnderglowStore(): UnderglowStore | null {
  return useContext(UnderglowContext);
}

/**
 * The current underglow for one node, or `null`. Stable reference until that
 * node's glow starts or clears, so the node only re-renders on its own events.
 */
export function useUnderglowForSystem(mapSystemId: string): ActiveUnderglow | null {
  const store = useContext(UnderglowContext);
  const subscribe = useCallback(
    (cb: () => void) => store?.subscribe(mapSystemId, cb) ?? (() => {}),
    [store, mapSystemId],
  );
  const getSnapshot = useCallback(
    () => store?.getForSystem(mapSystemId) ?? null,
    [store, mapSystemId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export type { UnderglowStore };
