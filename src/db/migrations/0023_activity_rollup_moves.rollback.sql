-- Manual rollback for 0023_activity_rollup_moves.sql. Run by hand (drizzle-kit
-- is forward-only):
--   psql "$DATABASE_URL" -f src/db/migrations/0023_activity_rollup_moves.rollback.sql
-- Restores the pre-17.7 rollup that counts every `system.updated` (including
-- pure position moves). Recreated WITH NO DATA; next refresh repopulates.
DROP MATERIALIZED VIEW IF EXISTS "ap_activity_rollup";
--> statement-breakpoint
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
