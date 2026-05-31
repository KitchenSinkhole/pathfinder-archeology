## MapUnderglowBridge

**Purpose:** Bridges incoming `systemNotification` realtime events to the underglow store — resolves the event's EVE solar-system id to a map node and triggers its glow with the kind's preset.
**File:** `src/components/map/MapUnderglowBridge.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| systems | MapSystemNode[] | yes | Current map systems; used to resolve `systemId` (EVE) → `id` (`ap_map_system.id`). Read via a ref so the effect subscription doesn't churn. |

### Renders
Nothing.

### Behaviour & Interactions
- Watches `useRealtime().lastEvent`; on `task === 'systemNotification'`, validates with `systemNotificationLoadSchema`, finds the node whose `systemId` matches `load.systemId`, and calls `store.trigger(node.id, UNDERGLOW_PRESETS[load.kind])`.
- Mirrors `TravelBridge` (systems via ref). Mounted by `MapCanvas` inside `MapUnderglowProvider`.
- **Known limitation:** `useRealtime` exposes only the latest `lastEvent`; rapid coalesced notifications could drop one — the same tradeoff `MapCanvas` accepts for `mapUpdate`. Killmails per watched system are low-frequency.

### Depends On
- `@/lib/realtime/useRealtime` (`useRealtime`), `@/lib/realtime/protocol` (`systemNotificationLoadSchema`), `./MapUnderglowContext` (`useUnderglowStore`), `./underglowPresets` (`UNDERGLOW_PRESETS`), `@/lib/map/loadMap` (`MapSystemNode`).
