-- Manual rollback for 0017_structure_event.sql. Drops the structure-intel
-- accountability log introduced in Stage 17.2.
--   psql "$DATABASE_URL" -f src/db/migrations/0017_structure_event.rollback.sql
DROP TABLE IF EXISTS "ap_structure_event";
--> statement-breakpoint
DROP TYPE IF EXISTS "structure_event_kind";
