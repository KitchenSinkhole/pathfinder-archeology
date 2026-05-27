-- Manual rollback for 0011_sov_fw.sql. Drops the mutable universe-state tables
-- populated by the Stage 13 `sov-fw-refresh` job.
--   psql "$DATABASE_URL" -f src/db/migrations/0011_sov_fw.rollback.sql
DROP TABLE IF EXISTS "universe_faction_war_system";
DROP TABLE IF EXISTS "universe_sovereignty_map";
