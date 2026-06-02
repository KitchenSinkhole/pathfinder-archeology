-- Restore the global per-character tracking flag. The TRUNCATE of
-- ap_map_character_tracking is not reversible — rolling back leaves the join
-- table empty, which the seed marker repopulates on next subscribe anyway.
ALTER TABLE "ap_character" ADD COLUMN "tracking_enabled" boolean DEFAULT true NOT NULL;
