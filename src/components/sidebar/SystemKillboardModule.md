## SystemKillboardModule

**Purpose:** Sidebar feed of recent zKillboard kills for the selected system (Stage 17.8).
**File:** `src/components/sidebar/SystemKillboardModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode \| null | yes | Selected system; null clears the feed |

### Renders
A `Card` ("Killboard") with a refresh button in the header; a list of recent kills. Each row: victim-ship icon, two-line label (victim pilot/corp name over `shipName · N involved`), a right column with compact ISK value (k/m/b) over a worded relative age (`formatAgoFromMs(…, 'long')` → "just now" / "5 minutes ago" / "2 hours ago" / days / weeks), and an external link to the zKillboard killmail. Shows select-a-system / loading / error / empty states.

### Behaviour & Interactions
- On `system` change, fetches `GET /api/system/<id>/killboard?limit=20` (Abortable; aborts on change/unmount). The refresh button re-fetches via a reload counter.
- Works for **all** systems including wormholes (zKillboard tracks J-space kills) — no K-space gate.
- Errors (incl. 429 rate-limit / 502 upstream) render as a degraded message, not a blank list.
- Kills are held in local state keyed by `killmailId`; structured so the Stage 17.8b live killstream can prepend into the same list without a refetch.

### Depends On
- `@/lib/map/killboard` (`KillboardKill` type), `@/lib/map/relativeTime` (`formatAgoFromMs`), `@/components/ui/card`, `@/components/ui/button`, `lucide-react`.
