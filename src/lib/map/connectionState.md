## connectionState.ts

**Purpose:** Pure client-side helpers that derive a wormhole connection's expiry instant / time remaining from `eolAt` / `createdAt` and the lifetime constants in `aperture.config.ts`. Drives the EOL countdown badge on `ConnectionEdge` and the "Expires in X" inspector hint.
**File:** `src/lib/map/connectionState.ts`

---

### connectionExpiresAt(c: ConnectionLifecycleInput): Date | null
Wall-clock instant the connection expires, or `null` when no expiry applies.

- Wormhole + `isEol`: `eolAt + WORMHOLE_EOL_LIFETIME_MS`.
- Wormhole + not EOL: `createdAt + WORMHOLE_DEFAULT_LIFETIME_MS`.
- Stargate / jumpbridge / abyssal: `null` (these connections never expire — the EOL state machine only applies to wormholes).
- EOL flagged but `eolAt` is null (stale-snapshot defence): `null`.

**Parameters:**
- `c` — a `Pick<MapConnectionEdge, 'scope' | 'isEol' | 'eolAt' | 'createdAt'>`.

**Returns:** `Date` or `null`.

---

### connectionTimeLeftMs(c: ConnectionLifecycleInput, now?: number): number | null
Milliseconds until `connectionExpiresAt(c)`. Returns `null` for non-expiring connections and `0` once past expiry (clamped, never negative). `now` defaults to `Date.now()` but is injectable for tests.

---

### ConnectionLifecycleInput
Type alias for `Pick<MapConnectionEdge, 'scope' | 'isEol' | 'eolAt' | 'createdAt'>` — the minimal shape the helpers consume.
