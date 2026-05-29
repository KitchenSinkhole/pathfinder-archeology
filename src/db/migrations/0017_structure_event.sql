DO $$ BEGIN
	CREATE TYPE "public"."structure_event_kind" AS ENUM('create', 'update', 'delete');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ap_structure_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"structure_id" bigint NOT NULL,
	"system_id" integer NOT NULL,
	"character_id" bigint,
	"kind" "structure_event_kind" NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_structure_event_character_id_ap_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."ap_character"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_structure_event_structure_id_idx" ON "ap_structure_event" USING btree ("structure_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_structure_event_character_id_idx" ON "ap_structure_event" USING btree ("character_id");
