## KillStatsModule

**Purpose:** Read-only sidebar module showing rolling-24h activity (jumps / ship / pod / NPC kills) for the selected system from `ap_system_stats`.
**File:** `src/components/sidebar/KillStatsModule.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode \| null | yes | Selected system, or null. |
| stats | SystemStatsSummary \| undefined | yes | 24h totals; absent → zero state. |

### Renders
A `Card` with four rows of 24h counts. Shows a select prompt when nothing is selected, and "Not tracked in wormhole space" for J-space systems (K-space only, matching legacy `system_graph`).

### Behaviour & Interactions
- Read-only. Renders zeros until the Stage 11 stats-refresh job populates `ap_system_stats`.
- Wormhole detection via the shared `isWormholeSystem` helper (`@/lib/map/space`).

### Depends On
- `@/components/ui/card`, `@/lib/map/space` (`isWormholeSystem`).
