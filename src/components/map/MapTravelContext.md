## MapTravelContext.tsx

**Purpose:** Client-side transient store for "a pilot just jumped across this connection", driving the per-account connection travel animation. Mirrors `MapPresenceContext`'s external-store shape so each `ConnectionEdge` subscribes only to its own slice — a single jump re-renders one edge, not the whole edges array.
**File:** `src/components/map/MapTravelContext.tsx`

---

### MapTravelProvider

Wraps the canvas subtree (inside `MapPresenceProvider`). Owns one `TravelStore`.

**Props:**
| Prop | Type | Required | Description |
|---|---|---|---|
| children | ReactNode | yes | The canvas subtree. |

### useTravelForConnection(connectionId: string): TravelPulse | null

Hook returning the active pulse for one connection (`ap_map_connection.id`), or null. Stable reference (via `useSyncExternalStore`) until that connection's pulse starts or clears, so the edge only re-renders on its own traversals. Returns null outside a provider. Consumed by `ConnectionEdge`.

### TravelBridge

Renders nothing. Listens to presence traversals (`useTraversals`) and resolves each to a map edge + direction, then calls `store.pulse`. Mounted by `MapCanvas` only when the account has the travel animation enabled — when absent, no pulse ever fires.

**Props:**
| Prop | Type | Required | Description |
|---|---|---|---|
| systems | MapSystemNode[] | yes | Current visible systems; used to map EVE solar-system id → `ap_map_system.id`. |
| connections | MapConnectionEdge[] | yes | Current connections; matched against the jump's endpoints in either direction. |

Resolution: presence is keyed by solar-system id, edges by `ap_map_system.id`. The bridge builds a `solarSystemId → mapSystemId` map from `systems`, looks up the jump's `from`/`to`, then pulses every connection whose `{source,target}` matches — `forward` when `source === from`, else `reverse`. `systems`/`connections` are read through refs so the traversal subscription never churns. Unknown endpoints (system not on this map) are skipped silently.

### TravelPulse (type)

`{ direction: 'forward' | 'reverse'; token: number }`. `direction` is relative to the connection's `source`/`target` (so the edge can play the SMIL motion forwards or backwards). `token` is a monotonic id used as a React `key` so a rapid re-jump remounts the animated element and restarts it.

### Behaviour
- A pulse self-clears after `TRAVEL_PULSE_MS` (1300ms, slightly longer than the 1.2s animation) via a per-connection timer, but only if a newer pulse hasn't replaced it (token check) — so back-to-back jumps restart cleanly without a flicker gap.

### Depends On
- `@/lib/map/loadMap` (`MapConnectionEdge`, `MapSystemNode` types)
- `./MapPresenceContext` (`useTraversals`)
