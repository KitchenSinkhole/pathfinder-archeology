## relativeTime.ts

**Purpose:** Pure helper that renders a millisecond delta as a compact relative-time string (`23h`, `2d`, `expired`). Shared by the signature TTL column and the connection EOL countdown.
**File:** `src/lib/map/relativeTime.ts`

---

### formatRelativeFromMs(ms: number): string
Formats a millisecond delta. Negative, zero, `NaN`, or non-finite input returns `"expired"`. Otherwise rounds to the nearest hour (`"23h"`) up to 24h, then to the nearest day (`"2d"`).

**Parameters:**
- `ms` — time remaining in milliseconds (caller computes against `Date.now()` so the function stays pure / testable).

**Returns:** `"expired"` | `"<n>h"` | `"<n>d"`.
