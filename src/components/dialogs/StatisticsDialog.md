## StatisticsDialog

**Purpose:** Global, header-launched per-character activity ranking with scope tabs, period navigation, and sparklines (Stage 17.7).
**File:** `src/components/dialogs/StatisticsDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controls dialog visibility |
| onOpenChange | (open: boolean) => void | yes | Open-state setter |

### Renders
A dialog with: scope `Tabs` (only the account's qualifying Private/Corp/Alliance tabs), a week/month/year segmented control, a prev/label/next period navigator, and a `StatsTable` (or loading / empty / error text).

### Behaviour & Interactions
- On open, resets to `scope=private`, `period=week`, `anchor=today` (live period).
- A single effect fetches `GET /api/statistics?scope&period&anchor` on any of `[open, scope, period, anchor]`; in-flight requests are aborted via `AbortController`.
- `availableScopes` comes back on every response (including 403/200) and drives which tabs render — private is always present for an active session.
- Prev/Next set `anchor` to the server-returned `prevAnchor`/`nextAnchor`; Next disables when `hasNext` is false (already at the current period).
- During a refetch the existing table dims rather than flashing empty.

### Depends On
- `StatsTable` — the TanStack table.
- `Tabs` / `Dialog` / `Button` UI primitives.
- `GET /api/statistics` (`src/app/api/statistics/route.ts`).
