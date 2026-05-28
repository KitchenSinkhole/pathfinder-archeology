-- Manual rollback for 0016_structure.sql. Drops the manual structure-intel
-- table introduced in Stage 17.1.
--   psql "$DATABASE_URL" -f src/db/migrations/0016_structure.rollback.sql
DROP TABLE IF EXISTS "ap_structure";
