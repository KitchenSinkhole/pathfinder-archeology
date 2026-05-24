-- Manual rollback for 0010_character_location_state.sql. Drops the four
-- last-known-location columns added to `ap_character` for Stage 12.1.
--   psql "$DATABASE_URL" -f src/db/migrations/0010_character_location_state.rollback.sql
ALTER TABLE "ap_character" DROP COLUMN IF EXISTS "last_system_id";
ALTER TABLE "ap_character" DROP COLUMN IF EXISTS "last_ship_type_id";
ALTER TABLE "ap_character" DROP COLUMN IF EXISTS "last_online";
ALTER TABLE "ap_character" DROP COLUMN IF EXISTS "last_location_at";
