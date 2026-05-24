-- Manual rollback for 0006_job_run.sql (ap_job_run). Run by hand (not by
-- drizzle-kit, which is forward-only) when reverting Stage 11's worker
-- observability table:
--   psql "$DATABASE_URL" -f src/db/migrations/0006_job_run.rollback.sql
--
-- This does NOT touch the `graphile_worker` schema — that schema is created
-- and migrated by graphile-worker's own runMigrations API on first boot.
-- To wipe the queue, `DROP SCHEMA graphile_worker CASCADE` after stopping all
-- workers.
DROP TABLE IF EXISTS "ap_job_run";
