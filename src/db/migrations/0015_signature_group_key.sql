-- Stage 16.7 — Scanner-level signature group key.
--
-- The legacy `ap_map_signature.group_id` FK to `universe_group` couldn't
-- represent the scanner-level grouping EVE shows in the probe-scanner Group
-- column. Of the seven scanner groups (Combat / Relic / Data / Gas / Wormhole
-- / Ore / Ghost) only `Wormhole` exists as a `universe_group` row in the SDE;
-- the others are absent. Replace `group_id` with a small enum.
--
-- The site-name string (e.g. "Forgotten Perimeter Habitation Coils") was
-- already stored in `name`; that column's meaning broadens to "user-typed
-- site name for cosmic sigs / wormhole code mirror for wormhole sigs".
-- `type_id` keeps its existing FK to `universe_type`, used only for wormhole
-- sigs (resolving to `universe_wormhole`).
--
-- Existing `group_id` values are discarded — this code path was unused in
-- production (rebuild hasn't shipped sig classification yet) and migrating
-- numeric ids to the seven scanner keys without a known mapping isn't safe.
--
-- Rollback: src/db/migrations/0015_signature_group_key.rollback.sql.

CREATE TYPE "public"."signature_group_key" AS ENUM(
    'combat',
    'relic',
    'data',
    'gas',
    'wormhole',
    'ore',
    'ghost'
);--> statement-breakpoint

ALTER TABLE "ap_map_signature" DROP CONSTRAINT IF EXISTS "ap_map_signature_group_id_universe_group_id_fk";--> statement-breakpoint
ALTER TABLE "ap_map_signature" DROP COLUMN "group_id";--> statement-breakpoint
ALTER TABLE "ap_map_signature" ADD COLUMN "group_key" "signature_group_key";
