-- Manual rollback for 0027_drop_structure_owner_name.sql. Re-adds the nullable
-- free-text owner column (data is not restored — it was discarded on drop).
--   psql "$DATABASE_URL" -f src/db/migrations/0027_drop_structure_owner_name.rollback.sql
ALTER TABLE "ap_structure" ADD COLUMN "owner_name" text;
