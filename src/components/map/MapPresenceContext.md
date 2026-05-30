## MapPresenceContext.tsx

**Purpose:** Client-side store for "which tracked pilots are in which system on this map". Seeds from the SSR'd `MapViewData.presence`, then folds incoming realtime `characterUpdate` envelopes on top. Each `SystemNode` subscribes only to its own system's slice so a single character moving re-renders at most two nodes.
**File:** `src/components/map/MapPresenceContext.tsx`

---

### MapPresenceProvider

Wraps the canvas subtree. Owns one `PresenceStore` instance.

**Props:**
| Prop | Type | Required | Description |
|---|---|---|---|
| initial | MapPresenceEntry[] | yes | The server-loaded initial roster from `loadMapPresence` (via `MapViewData.presence`). |
| children | ReactNode | yes | The canvas subtree. |

The provider seeds the store synchronously inside `useState`'s init so the first paint already shows badges; an effect re-seeds when the `initial` reference actually changes (e.g. soft navigation back to this map). It also subscribes to `useRealtime().lastEvent` and calls `store.apply()` for every parsed `characterUpdate` envelope.

### usePresenceForSystem(systemId: number): readonly MapPresenceEntry[]

Hook returning the pilot list for one EVE solar-system. Returns a stable array reference until that system's slice changes (`useSyncExternalStore` semantics). Returns the module-level `EMPTY` array when the system has no pilots or the hook is used outside a provider (cheap no-op on read-only routes).

### usePresenceForMap(): readonly MapPresenceEntry[]

Hook returning every online + located pilot across the whole map, sorted by name. Subscribes to the store's map-wide subscriber set, so it re-renders whenever any system's slice changes. The flattened snapshot is cached on the store (rebuilt only on mutation) to satisfy `useSyncExternalStore`'s stable-reference requirement. Used by `MapInfoDialog` for the online-pilot count and the Users roster.

### useTraversals(cb: (t: Traversal) => void): void

Subscribes to pilot jumps. The store emits a `Traversal` (`{ characterId, fromSystemId, toSystemId, at }`, solar-system ids) whenever `apply()` folds a `characterUpdate` that moves an online + located pilot from one system to a *different* located system. Seed/offline transitions and same-system re-reports don't emit. The callback is held in a ref so it can change every render without re-subscribing. Consumed by `MapTravelContext`'s `TravelBridge` to drive the connection travel animation.

### Traversal (type)

`{ characterId: number; fromSystemId: number; toSystemId: number; at: string }` — a detected jump, keyed by EVE solar-system id (`at` is the ISO detection timestamp).

### Behaviour
- **Offline pilots are hidden.** The store only inserts an entry when `online === true && systemId !== null && locationAt !== null`. An envelope with any of those falsy removes the character from their prior system (if any) and inserts nothing.
- **Sorted by character name** within each system, so the hover list renders deterministically.
- **Re-seed (full replace)** notifies every previously-present *and* currently-present system — so a system that lost all its pilots between server-load snapshots still re-renders to empty.

### Depends On
- `@/lib/map/loadMap` (`MapPresenceEntry` type)
- `@/lib/realtime/protocol` (`characterUpdateLoadSchema`, `CharacterUpdateLoad`)
- `@/lib/realtime/useRealtime` (`useRealtime`)
