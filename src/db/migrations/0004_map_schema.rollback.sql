-- Manual rollback for 0004_map_schema.sql. Drops every object created by that
-- migration in reverse dependency order. Run by hand (not by drizzle-kit, which
-- is forward-only) when reverting Stage 6:
--   psql "$DATABASE_URL" -f src/db/migrations/0004_map_schema.rollback.sql
DROP TRIGGER IF EXISTS "tg_map_event_notify" ON "ap_map_event";
DROP FUNCTION IF EXISTS "fn_map_event_notify"();
-- Detach pg_partman config first so it stops managing the (about-to-be-dropped)
-- table; CASCADE removes the child partitions along with the parent.
DELETE FROM partman.part_config WHERE parent_table = 'public.ap_map_event';
DROP TABLE IF EXISTS "ap_map_event" CASCADE;
DROP TABLE IF EXISTS "ap_map_signature";
DROP TABLE IF EXISTS "ap_event_kind";
DROP TABLE IF EXISTS "ap_map_connection";
DROP TABLE IF EXISTS "ap_map_system";
DROP TABLE IF EXISTS "ap_map";
DROP TYPE IF EXISTS "wh_jump_mass";
DROP TYPE IF EXISTS "wh_mass";
DROP TYPE IF EXISTS "connection_scope";
DROP TYPE IF EXISTS "system_status";
DROP TYPE IF EXISTS "map_type";
DROP TYPE IF EXISTS "map_scope";
