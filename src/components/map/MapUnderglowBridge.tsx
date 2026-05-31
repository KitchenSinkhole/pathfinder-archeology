'use client';

import { useEffect, useRef } from 'react';
import type { MapSystemNode } from '@/lib/map/loadMap';
import { systemNotificationLoadSchema } from '@/lib/realtime/protocol';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { useUnderglowStore } from './MapUnderglowContext';
import { UNDERGLOW_PRESETS } from './underglowPresets';

// Listens for `systemNotification` realtime events and resolves each to a map
// node, then triggers that node's underglow with the kind's preset. Renders
// nothing. Mirrors `TravelBridge`: `systems` is read through a ref so the
// effect's subscription never churns when the systems array changes.
//
// Notifications are keyed by EVE solar-system id; the underglow store is keyed
// by `ap_map_system.id`, so we map the former to the latter via `systems`.
//
// Known limitation (accepted, matches `MapCanvas`'s mapUpdate handling):
// `useRealtime` exposes only the latest `lastEvent`, so two notifications
// coalesced within one render frame could drop one. Killmails per watched
// system are low-frequency; this is the same tradeoff already live elsewhere.

export function MapUnderglowBridge({ systems }: { systems: MapSystemNode[] }) {
  const systemsRef = useRef(systems);
  useEffect(() => {
    systemsRef.current = systems;
  });

  const store = useUnderglowStore();
  const { lastEvent } = useRealtime();

  useEffect(() => {
    if (!store || !lastEvent || lastEvent.task !== 'systemNotification') return;
    const parsed = systemNotificationLoadSchema.safeParse(lastEvent.load);
    if (!parsed.success) return;
    const load = parsed.data;

    const node = systemsRef.current.find((s) => s.systemId === load.systemId);
    if (!node) return;

    store.trigger(node.id, UNDERGLOW_PRESETS[load.kind]);
  }, [lastEvent, store]);

  return null;
}
