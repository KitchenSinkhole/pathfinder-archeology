## MapUnderglowContext

**Purpose:** Transient per-node "underglow" external store (keyed by `ap_map_system.id`) + provider + per-node hook — the versatile glow-highlight primitive shared by killmail alerts and future rally/unscanned-sig indicators.
**File:** `src/components/map/MapUnderglowContext.tsx`

Mirrors `MapTravelContext`: a `useSyncExternalStore`-backed store so one event re-renders one node, not the whole nodes array. The animation lives in `SystemUnderglow`; this store only tracks *which* node, *which* `UnderglowConfig`, and a monotonic `token` so a rapid re-trigger restarts the CSS animation (via React `key`). The producer is `MapUnderglowBridge`.

### Exports

#### MapUnderglowProvider
React provider holding one `UnderglowStore` for its subtree. Mounted by `MapCanvas` (inside `MapPresenceProvider`, beside `MapTravelProvider`).

#### useUnderglowStore(): UnderglowStore | null
Producer-side accessor — `MapUnderglowBridge` calls `store.trigger` / `store.clear`. `null` outside a provider.

#### useUnderglowForSystem(mapSystemId: string): ActiveUnderglow | null
Consumer-side per-node subscription. Returns `{ config, token }` while a glow is active on that node, else `null`. Stable reference until that node's glow starts/clears.

### Store API (`UnderglowStore`)
- `trigger(mapSystemId, config)` — start/restart a glow; if `config.durationMs > 0` an auto-expire timer clears it (skipped for `0` ⇒ persistent-until-cleared, the rally/sig case).
- `clear(mapSystemId)` — remove a persistent or in-flight glow.
- `getForSystem` / `subscribe` — the `useSyncExternalStore` plumbing.

### Types
- `ActiveUnderglow` — `{ config: UnderglowConfig, token: number }`.

### Depends On
- `@/types` (`UnderglowConfig`).
