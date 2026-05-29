-- Manual rollback for 0018_account_main_character.sql. Drops the account
-- main-character pointer introduced in Stage 17.5.
--   psql "$DATABASE_URL" -f src/db/migrations/0018_account_main_character.rollback.sql
ALTER TABLE "ap_user" DROP CONSTRAINT IF EXISTS "ap_user_main_character_id_ap_character_id_fk";
--> statement-breakpoint
ALTER TABLE "ap_user" DROP COLUMN IF EXISTS "main_character_id";
