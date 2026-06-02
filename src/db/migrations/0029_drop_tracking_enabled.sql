-- Per-map character tracking, finalizing migration. The global per-character
-- `tracking_enabled` flag is gone — `ap_map_character_tracking` (map_id,
-- character_id) is now the single source of truth, gated by the per-(map,
-- account) `ap_map_tracking_seed` marker.
--
-- Clean slate: existing tracking rows are artifacts of the old auto-follow
-- (last-map-opened) behavior, not deliberate per-map selections. Truncate them
-- and let each map re-seed all of an account's active characters on its next
-- subscribe under the new default.
TRUNCATE TABLE "ap_map_character_tracking";--> statement-breakpoint
ALTER TABLE "ap_character" DROP COLUMN "tracking_enabled";
