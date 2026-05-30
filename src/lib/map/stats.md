## stats.ts

**Purpose:** Read-only per-system activity reads from `ap_system_stats` — rolling-24h totals (kill-stats module) and a bucketed time-series (system-graph module).
**File:** `src/lib/map/stats.ts`

---

### statsForSystems(systemIds: number[]): Promise<Record<number, SystemStatsSummary>>
Sums `jumps` / `ship_kills` / `pod_kills` / `faction_kills` over the rolling 24h window (`hour_bucket > now() - interval '24 hours'`), grouped by system, keyed by EVE solar-system id. Systems with no rows are absent (module shows a zero state).

### systemStatsSeries(systemId: number, range: GraphRange): Promise<SystemStatsPoint[]>
Bucketed activity series for one system over `range`, ordered ascending. `24h` → hourly buckets; `7d`/`30d` → daily buckets (summed via `date_trunc`). Sparse — empty buckets are omitted (the graph module fills gaps client-side). `bucket` is an ISO timestamp string.

The `date_trunc` unit is inlined as a SQL literal via `sql.raw(unit)`, **not** a bound parameter. A `$n` placeholder renders a distinct position in each clause, so the SELECT's `date_trunc` would not match the GROUP BY's and Postgres errors with "must appear in the GROUP BY clause". `unit` is a controlled enum (`'hour' | 'day'`), so inlining is injection-safe.

### Types
- `SystemStatsSummary` — `{ jumps, shipKills, podKills, factionKills }`.
- `GraphRange` — `'24h' | '7d' | '30d'`.
- `SystemStatsPoint` — `{ bucket: string } & SystemStatsSummary`.

### Notes
- `ap_system_stats` is empty until the Stage 11 refresh job populates it, so this returns an empty record today — but the query path is real.

### Depends on
- `@/db/client` (`db`), `@/db/schema` (`apSystemStats`).
