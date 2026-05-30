-- Custom SQL migration file, put your code below! --
-- Stage 17.7. Re-bucket pure canvas position moves out of the activity rollup.
--
-- A drag-only `system.updated` (payload carries positionX/positionY and no
-- substantive field) is not a contribution to the communal map, so it must not
-- inflate the System "update" statistic. Materialized views can't be ALTERed in
-- place, so drop + recreate with a CASE that re-labels such rows to the derived
-- kind `system.moved` (the statistics reader excludes it). Source of truth kept
-- in sync at `src/db/views/activity_rollup.sql`.
--
-- Recreated `WITH NO DATA`; the hourly `activity-rollup-refresh` job (or the
-- first read) repopulates it. Rollback: 0023_activity_rollup_moves.rollback.sql.

DROP MATERIALIZED VIEW IF EXISTS "ap_activity_rollup";
--> statement-breakpoint
CREATE MATERIALIZED VIEW "ap_activity_rollup" AS
SELECT
  EXTRACT(ISOYEAR FROM occurred_at)::int      AS iso_year,
  EXTRACT(WEEK    FROM occurred_at)::int      AS iso_week,
  COALESCE(character_id, 0::bigint)           AS character_id,
  map_id,
  CASE
    WHEN kind = 'system.updated'
     AND (payload ? 'positionX' OR payload ? 'positionY')
     AND NOT (payload ?| ARRAY['alias', 'tag', 'status', 'intelNotes', 'locked', 'rallyAt'])
    THEN 'system.moved'
    ELSE kind
  END                                         AS kind,
  count(*)::int                               AS event_count
FROM "ap_map_event"
GROUP BY 1, 2, 3, 4, 5
WITH NO DATA;
--> statement-breakpoint
CREATE UNIQUE INDEX "ap_activity_rollup_pk_idx"
  ON "ap_activity_rollup" (iso_year, iso_week, character_id, map_id, kind);
