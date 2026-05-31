-- Manual rollback for 0026_universe_corporation_cache.sql. Drops the structure
-- owner FK and the corporation cache table (`owner_corporation_id` values are
-- retained as plain bigints; re-add the constraint to restore integrity).
--   psql "$DATABASE_URL" -f src/db/migrations/0026_universe_corporation_cache.rollback.sql
ALTER TABLE "ap_structure" DROP CONSTRAINT IF EXISTS "ap_structure_owner_corporation_id_universe_corporation_id_fk";
--> statement-breakpoint
DROP TABLE IF EXISTS "universe_corporation";
