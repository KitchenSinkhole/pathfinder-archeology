CREATE TABLE IF NOT EXISTS "ap_structure" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"system_id" integer NOT NULL,
	"name" text NOT NULL,
	"structure_type_id" integer NOT NULL,
	"owner_name" text,
	"notes" text,
	"created_by_character_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_structure_system_id_universe_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_system"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "ap_structure_structure_type_id_universe_type_id_fk" FOREIGN KEY ("structure_type_id") REFERENCES "public"."universe_type"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "ap_structure_created_by_character_id_ap_character_id_fk" FOREIGN KEY ("created_by_character_id") REFERENCES "public"."ap_character"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_structure_system_id_idx" ON "ap_structure" USING btree ("system_id");
