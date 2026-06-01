## relativeTime.ts

**Purpose:** Pure helpers that render a millisecond delta as a relative-time string. `formatRelativeFromMs` is a forward countdown (`23h`, `2d`, `expired`); `formatAgoFromMs` is a backward "time ago" (`5m ago` / `5 minutes ago`). Shared by the signature TTL / Created / Updated columns, the connection EOL countdown, and the killboard feed.
**File:** `src/lib/map/relativeTime.ts`

---

### formatRelativeFromMs(ms: number): string
Formats a forward millisecond delta (time remaining). Negative, zero, `NaN`, or non-finite input returns `"expired"`. Otherwise rounds to the nearest hour (`"23h"`) up to 24h, then to the nearest day (`"2d"`).

**Parameters:**
- `ms` — time remaining in milliseconds (caller computes against `Date.now()` so the function stays pure / testable).

**Returns:** `"expired"` | `"<n>h"` | `"<n>d"`.

---

### formatAgoFromMs(ms: number, style?: 'compact' | 'long'): string
Formats a backward millisecond delta (elapsed time). Sub-minute or non-finite input returns `"just now"`. Units **floor** (not round) to match "ago" semantics — a 90-minute delta reads `"1 hour ago"`, never `"2 hours ago"`. Steps minutes → hours → days → weeks.

**Parameters:**
- `ms` — elapsed milliseconds (caller computes `Date.now() - ts` so the function stays pure / testable).
- `style` — `"compact"` (default, `"5m ago"` / `"2d ago"`) or `"long"` (`"5 minutes ago"` / `"2 days ago"`, pluralised).

**Returns:** `"just now"` | `"<n>m ago"` / `"<n> minutes ago"` | `…h` | `…d` | `…w`.
