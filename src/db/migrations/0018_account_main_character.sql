ALTER TABLE "ap_user" ADD COLUMN "main_character_id" bigint;
--> statement-breakpoint
ALTER TABLE "ap_user" ADD CONSTRAINT "ap_user_main_character_id_ap_character_id_fk" FOREIGN KEY ("main_character_id") REFERENCES "public"."ap_character"("id") ON DELETE set null ON UPDATE no action;
