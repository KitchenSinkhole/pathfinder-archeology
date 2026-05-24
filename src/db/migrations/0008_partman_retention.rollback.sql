-- Manual rollback for 0008_partman_retention.sql. Clears the retention policy
-- on `ap_system_stats` back to partman defaults (keep indefinitely).
--   psql "$DATABASE_URL" -f src/db/migrations/0008_partman_retention.rollback.sql
UPDATE "partman"."part_config"
   SET "retention" = NULL,
       "retention_keep_table" = true,
       "retention_keep_index" = true
 WHERE "parent_table" = 'public.ap_system_stats';
