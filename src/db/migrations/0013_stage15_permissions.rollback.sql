-- Manual rollback for 0013_stage15_permissions.sql. Drops the Stage 15
-- permissions schema. Run by hand (drizzle-kit is forward-only):
--   psql "$DATABASE_URL" -f src/db/migrations/0013_stage15_permissions.rollback.sql
ALTER TABLE "ap_character" DROP COLUMN IF EXISTS "authz_synced_at";
ALTER TABLE "ap_character" DROP COLUMN IF EXISTS "status_expires_at";
ALTER TABLE "ap_map" DROP CONSTRAINT IF EXISTS "ap_map_owner_matches_type_chk";
ALTER TABLE "ap_map" DROP CONSTRAINT IF EXISTS "ap_map_owner_character_id_ap_character_id_fk";
ALTER TABLE "ap_map" DROP COLUMN IF EXISTS "owner_alliance_id";
ALTER TABLE "ap_map" DROP COLUMN IF EXISTS "owner_corporation_id";
ALTER TABLE "ap_map" DROP COLUMN IF EXISTS "owner_character_id";
DROP TABLE IF EXISTS "ap_corporation_right";
DROP TABLE IF EXISTS "ap_map_role_access";
DROP TABLE IF EXISTS "ap_character_role";
DROP TABLE IF EXISTS "ap_role";
DROP TABLE IF EXISTS "ap_corporation";
DROP TYPE IF EXISTS "public"."role_source";
DROP TYPE IF EXISTS "public"."map_right";
