## styling.ts

**Purpose:** Pure styling helpers translating system status and connection state into SVG-safe colours/strokes for the read-only map canvas.
**File:** `src/components/map/styling.ts`

---

### systemStatusColor(status): string
Maps a `system_status` enum value to a hex colour (unknown→grey, friendly→blue, occupied→amber, hostile→red, empty→green, unscanned→purple).

### connectionStyle(edge: MapConnectionEdge): EdgeStyle
Returns `{ stroke, strokeWidth, strokeDasharray? }`. Scope sets the base colour; wormholes are recoloured by `massStatus` (fresh/reduced/critical). `isEol` dashes the line; `isFrigate` thins it.

### connectionBadges(edge: MapConnectionEdge): string[]
Short uppercase labels for a connection: jump-mass class, `EOL`, `FRIG`, `ROLL`, `PRES`.

### Notes
- Colours mirror legacy semantics, not exact legacy hex. Kept out of Tailwind tokens because they're consumed inside SVG/inline styles.
