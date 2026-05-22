## stats.ts

**Purpose:** Read-only rolling-24h per-system activity totals from `ap_system_stats` for the kill-stats module.
**File:** `src/lib/map/stats.ts`

---

### statsForSystems(systemIds: number[]): Promise<Record<number, SystemStatsSummary>>
Sums `jumps` / `ship_kills` / `pod_kills` / `faction_kills` over the rolling 24h window (`hour_bucket > now() - interval '24 hours'`), grouped by system, keyed by EVE solar-system id. Systems with no rows are absent (module shows a zero state).

### Types
- `SystemStatsSummary` — `{ jumps, shipKills, podKills, factionKills }`.

### Notes
- `ap_system_stats` is empty until the Stage 11 refresh job populates it, so this returns an empty record today — but the query path is real.

### Depends on
- `@/db/client` (`db`), `@/db/schema` (`apSystemStats`).
