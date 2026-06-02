-- Manual rollback for 0028_map_tracking_seed.sql. Run by hand (not by
-- drizzle-kit, which is forward-only) when reverting Stage 1 of the
-- per-map-character-tracking plan:
--   psql "$DATABASE_URL" -f src/db/migrations/0028_map_tracking_seed.rollback.sql
DROP TABLE IF EXISTS "ap_map_tracking_seed";
