-- Manual rollback for 0005_blue_sway.sql (ap_system_stats). Run by hand (not by
-- drizzle-kit, which is forward-only) when reverting Stage 7's stats table:
--   psql "$DATABASE_URL" -f src/db/migrations/0005_blue_sway.rollback.sql
-- Detach pg_partman config first so it stops managing the (about-to-be-dropped)
-- table; CASCADE removes the child partitions along with the parent.
DELETE FROM partman.part_config WHERE parent_table = 'public.ap_system_stats';
DROP TABLE IF EXISTS "ap_system_stats" CASCADE;
