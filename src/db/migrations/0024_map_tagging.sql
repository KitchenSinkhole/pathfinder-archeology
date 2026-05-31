-- Stage 17.10 auto-tagging. Adds the per-map tagging scheme + Home system.
-- `home_map_system_id`'s FK → `ap_map_system.id` is declared here (not in the
-- Drizzle table object) to avoid the `map.ts ↔ map_system.ts` import cycle —
-- same pattern as `ap_user.main_character_id` (0018). ON DELETE SET NULL keeps
-- the FK valid during a map hard-purge (the user-facing Home delete is blocked
-- by an app guard in `removeSystem`).
CREATE TYPE "public"."tag_scheme" AS ENUM('none', 'abc', '0121');
--> statement-breakpoint
ALTER TABLE "ap_map" ADD COLUMN "tag_scheme" "tag_scheme" DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ap_map" ADD COLUMN "home_map_system_id" bigint;
--> statement-breakpoint
ALTER TABLE "ap_map" ADD CONSTRAINT "ap_map_home_map_system_id_ap_map_system_id_fk" FOREIGN KEY ("home_map_system_id") REFERENCES "public"."ap_map_system"("id") ON DELETE set null ON UPDATE no action;
