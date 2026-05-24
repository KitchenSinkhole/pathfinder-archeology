-- Custom SQL migration file, put your code below! --
-- Stage 11.4. Apply the weekly activity-log rollup materialized view.
-- Source kept in sync at `src/db/views/activity_rollup.sql` — duplicate it here
-- because drizzle-kit migrations must be self-contained.

CREATE MATERIALIZED VIEW "ap_activity_rollup" AS
SELECT
  EXTRACT(ISOYEAR FROM occurred_at)::int      AS iso_year,
  EXTRACT(WEEK    FROM occurred_at)::int      AS iso_week,
  COALESCE(character_id, 0::bigint)           AS character_id,
  map_id,
  kind,
  count(*)::int                               AS event_count
FROM "ap_map_event"
GROUP BY 1, 2, 3, 4, 5
WITH NO DATA;
--> statement-breakpoint
CREATE UNIQUE INDEX "ap_activity_rollup_pk_idx"
  ON "ap_activity_rollup" (iso_year, iso_week, character_id, map_id, kind);
