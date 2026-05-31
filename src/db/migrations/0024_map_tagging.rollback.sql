-- Manual rollback for 0024_map_tagging.sql. Drops the per-map auto-tagging
-- scheme + Home system introduced in Stage 17.10.
--   psql "$DATABASE_URL" -f src/db/migrations/0024_map_tagging.rollback.sql
ALTER TABLE "ap_map" DROP CONSTRAINT IF EXISTS "ap_map_home_map_system_id_ap_map_system_id_fk";
--> statement-breakpoint
ALTER TABLE "ap_map" DROP COLUMN IF EXISTS "home_map_system_id";
--> statement-breakpoint
ALTER TABLE "ap_map" DROP COLUMN IF EXISTS "tag_scheme";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."tag_scheme";
