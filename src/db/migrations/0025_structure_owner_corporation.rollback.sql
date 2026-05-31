-- Manual rollback for 0025_structure_owner_corporation.sql. Drops the resolved
-- corporation id from structure intel (free-text `owner_name` is retained).
--   psql "$DATABASE_URL" -f src/db/migrations/0025_structure_owner_corporation.rollback.sql
ALTER TABLE "ap_structure" DROP COLUMN IF EXISTS "owner_corporation_id";
