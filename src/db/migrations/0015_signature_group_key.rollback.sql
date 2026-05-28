-- Rollback for 0015_signature_group_key.sql.
--
-- Restores the integer FK column `group_id` and drops the `signature_group_key`
-- enum + the `group_key` column. Data in `group_key` is discarded (cannot map
-- the seven scanner keys back to `universe_group` ids — the cosmic six don't
-- exist as `universe_group` rows).

ALTER TABLE "ap_map_signature" DROP COLUMN "group_key";--> statement-breakpoint
DROP TYPE "public"."signature_group_key";--> statement-breakpoint

ALTER TABLE "ap_map_signature" ADD COLUMN "group_id" integer;--> statement-breakpoint
ALTER TABLE "ap_map_signature" ADD CONSTRAINT "ap_map_signature_group_id_universe_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."universe_group"("id") ON DELETE set null ON UPDATE no action;
