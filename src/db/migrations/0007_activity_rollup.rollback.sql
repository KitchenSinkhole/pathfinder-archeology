-- Manual rollback for 0007_activity_rollup.sql (ap_activity_rollup MV). Run by
-- hand (not by drizzle-kit, which is forward-only):
--   psql "$DATABASE_URL" -f src/db/migrations/0007_activity_rollup.rollback.sql
-- Drops the index along with the MV.
DROP MATERIALIZED VIEW IF EXISTS "ap_activity_rollup";
