-- Custom SQL migration file, put your code below! --
-- Stage 11.5. Retention policy for `ap_system_stats`.
--
-- The legacy circular-buffer table held a rolling 24h window — anything older
-- was overwritten in place. In the rebuild `ap_system_stats` is a daily
-- partitioned time-series, so retention is a pg_partman config (60 days =
-- enough headroom for any month-over-month read while keeping the partition
-- list bounded). The daily `partition-maintenance` task (Stage 11.5) is what
-- actually applies the policy.
--
-- `ap_map_event` keeps its default "no retention" (SPEC §6.5 — monthly
-- partitions kept indefinitely; deployments may attach their own retention).
UPDATE "partman"."part_config"
   SET "retention" = '60 days',
       "retention_keep_table" = false,
       "retention_keep_index" = false
 WHERE "parent_table" = 'public.ap_system_stats';
