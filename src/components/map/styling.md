## styling.ts

**Purpose:** Pure styling helpers translating system status, system class, and connection state into SVG-safe colours/strokes for the map canvas.
**File:** `src/components/map/styling.ts`

---

### systemClassColor(cls: string | null | undefined): string
Maps a `universe_system.security` or `universe_wormhole.target_class` label to a hex colour.
- `H` green, `L` orange, `0.0` firetruck-red, `P` (Pochven) deep rose-red, `A` (Abyssal) teal.
- `C1`–`C6` progress from sky-blue → cyan → emerald → amber → orange → orangy-red.
- Unknown/null → grey `#6b7280`.

### systemStatusColor(status): string
Maps a `system_status` enum value to a hex colour (unknown→grey, friendly→blue, occupied→amber, hostile→red, empty→green, unscanned→purple).

### connectionStyle(edge: MapConnectionEdge): EdgeStyle
Returns `{ stroke, strokeWidth, strokeDasharray? }`. Scope sets the base colour; wormholes are recoloured by `massStatus` (fresh/reduced/critical). `isEol` dashes the line; `jumpMassClass === 's'` thins the stroke (frigate/small holes).

### connectionBadges(edge: MapConnectionEdge): string[]
Short uppercase labels for a connection: jump-mass class (`S`/`M`/`L`/`XL`), `EOL`, `ROLL`, `PRES`.

### Notes
- Colours mirror legacy semantics, not exact legacy hex. Kept out of Tailwind tokens because they're consumed inside SVG/inline styles.
