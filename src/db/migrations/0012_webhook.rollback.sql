-- Manual rollback for 0012_webhook.sql. Drops the Stage 14 webhook table and
-- the two enums it depends on. Run by hand (drizzle-kit is forward-only):
--   psql "$DATABASE_URL" -f src/db/migrations/0012_webhook.rollback.sql
DROP TABLE IF EXISTS "ap_map_webhook";
DROP TYPE IF EXISTS "public"."ap_webhook_event";
DROP TYPE IF EXISTS "public"."ap_webhook_channel";
