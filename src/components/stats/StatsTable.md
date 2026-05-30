## StatsTable

**Purpose:** Ranks characters by activity for one scope/period — the rebuild's first `@tanstack/react-table` use (Stage 17.7).
**File:** `src/components/stats/StatsTable.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| rows | ActivityStatRow[] | yes | Pre-aggregated rows from `/api/statistics` (already main-attributed) |

### Renders
A sortable table: rank, pilot (portrait + name), three create/update/delete triplet groups (System / Connection / Signature) under a static grouping header row, a Total column, and a `<Sparkline>` trend column.

### Behaviour & Interactions
- TanStack: `useReactTable` + `getCoreRowModel` + `getSortedRowModel` + `flexRender`. Sorting state lives in local `useState`, defaulting to `total` desc.
- Click any sortable leaf header to toggle sort; an up/down arrow marks the active column.
- `rank` is the 1-based position in the **sorted** row model (recomputed per render), so it tracks the active sort.
- Zero numeric cells are dimmed. Portraits are plain `<img>` to the EVE CDN (no Next loader); the unknown bucket shows a blank avatar.
- Assumes `rows.length > 0` — the empty state is handled by the parent `StatisticsDialog`.

### Depends On
- `Sparkline` — trailing-window series renderer.
- `ActivityStatRow` (`@/types`).
