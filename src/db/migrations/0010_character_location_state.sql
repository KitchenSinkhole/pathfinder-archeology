ALTER TABLE "ap_character" ADD COLUMN "last_system_id" integer;--> statement-breakpoint
ALTER TABLE "ap_character" ADD COLUMN "last_ship_type_id" integer;--> statement-breakpoint
ALTER TABLE "ap_character" ADD COLUMN "last_online" boolean;--> statement-breakpoint
ALTER TABLE "ap_character" ADD COLUMN "last_location_at" timestamp with time zone;