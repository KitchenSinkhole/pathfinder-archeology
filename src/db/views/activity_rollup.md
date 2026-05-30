## activity_rollup.sql

**Purpose:** SQL source of the `ap_activity_rollup` materialized view — a weekly per-(character, map, event-kind) counter over `ap_map_event`, replacing the legacy `activity_log` table. Stage 11.4.
**File:** `src/db/views/activity_rollup.sql`

---

### Shape
| Column | Type | Notes |
|---|---|---|
| `iso_year` | int | ISO-week year (`EXTRACT(ISOYEAR FROM occurred_at)`). |
| `iso_week` | int | ISO week 1–53 (`EXTRACT(WEEK FROM occurred_at)`). |
| `character_id` | bigint | `COALESCE(ap_map_event.character_id, 0)` — 0 is the "character erased" sentinel; `ap_character.id` is a `bigserial` starting at 1 so 0 never collides. |
| `map_id` | bigint | `ap_map_event.map_id`. |
| `kind` | text | One of the seeded `ap_event_kind` values, **except** a drag-only `system.updated` (payload has positionX/positionY and no substantive field) is re-bucketed to the derived kind `system.moved`. `system.moved` is never an emitted `ap_map_event.kind` — it exists only in this rollup, and the statistics reader (`src/lib/stats/activity.ts`) excludes it. |
| `event_count` | int | `count(*)` over the group. |

### Unique index
`ap_activity_rollup_pk_idx (iso_year, iso_week, character_id, map_id, kind)`. Required by `REFRESH MATERIALIZED VIEW CONCURRENTLY` (PG requires a unique index on **plain columns** — no expressions in the index, which is why the `COALESCE` lives in the view definition rather than the index).

### Created `WITH NO DATA`
The MV is populated by the first `REFRESH MATERIALIZED VIEW CONCURRENTLY` run from `activityRollupRefresh.ts` (Stage 11.4). Until then, `SELECT * FROM ap_activity_rollup` returns zero rows — that's the intended cold-start state, not a bug.

### Applied by
`src/db/migrations/0007_activity_rollup.sql` creates it; `0023_activity_rollup_moves.sql` (Stage 17.7) drops + recreates it with the `system.moved` re-bucketing. Each has a hand-run `.rollback.sql`.

### Notes
- The MV intentionally **does not** join `ap_event_kind` to bring `category` along — keeping the grouping shape identical to the spec's tuple. Admin UI joins to `ap_event_kind` at read time.
- `system.moved` is a **derived** bucket (a `CASE` on the `system.updated` payload), not a value written to `ap_map_event` — so it is deliberately absent from the `ap_event_kind` catalog. A re-create migration is required to change the `CASE` because materialized views can't be `ALTER`ed in place.
- The materialized view sits outside the Drizzle schema graph (there is no `apActivityRollup` table in `src/db/schema/`). Reads from app code use raw SQL via `db.execute(sql\`...\`)`, the same pattern as `universe_type_attribute_effective` (`0001_type_attribute_effective_view.sql`).
