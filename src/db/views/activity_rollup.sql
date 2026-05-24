-- Stage 11.4. Weekly activity-log rollup over ap_map_event, refreshed hourly
-- by the `activity-rollup-refresh` graphile-worker task.
--
-- This replaces the legacy `activity_log` table (per-week INSERT-DELAYED
-- counter rows) by aggregating the unified `ap_map_event` history into the
-- same (year, week, character, map, kind) shape. SPEC §6.2 / §6.5.
--
-- The CONCURRENTLY refresh path requires a UNIQUE index on plain columns (no
-- expressions). `ap_map_event.character_id` is nullable (ON DELETE SET NULL,
-- per SPEC §6.5 — erasing a character must not cascade-wipe their map history),
-- so the view collapses NULL to 0 via COALESCE so the column itself is plain
-- non-null and the index covers every row deterministically. Character id 0 is
-- safe as the "no character" sentinel because ap_character.id is a bigserial
-- starting at 1.

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

-- Unique index covering every grouping column — required by REFRESH MATERIALIZED
-- VIEW CONCURRENTLY. Plain columns only (no expressions).
CREATE UNIQUE INDEX "ap_activity_rollup_pk_idx"
  ON "ap_activity_rollup" (iso_year, iso_week, character_id, map_id, kind);
