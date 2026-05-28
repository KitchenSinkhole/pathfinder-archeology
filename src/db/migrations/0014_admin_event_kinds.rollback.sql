-- Manual rollback for 0014_admin_event_kinds.sql. Removes the Stage 16.2
-- admin event-kind seed rows. Run by hand (drizzle-kit is forward-only):
--   psql "$DATABASE_URL" -f src/db/migrations/0014_admin_event_kinds.rollback.sql
DELETE FROM "ap_event_kind" WHERE "kind" IN ('map.restore', 'map.purge');
