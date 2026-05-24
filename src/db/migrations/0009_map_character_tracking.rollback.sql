-- Manual rollback for 0009_map_character_tracking.sql. Run by hand (not by
-- drizzle-kit, which is forward-only) when reverting Stage 12.0:
--   psql "$DATABASE_URL" -f src/db/migrations/0009_map_character_tracking.rollback.sql
DROP TABLE IF EXISTS "ap_map_character_tracking";
