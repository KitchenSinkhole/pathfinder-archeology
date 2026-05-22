CREATE TABLE "universe_wormhole" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_class" text,
	"target_class" text
);
--> statement-breakpoint
ALTER TABLE "universe_wormhole" ADD CONSTRAINT "universe_wormhole_type_id_universe_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."universe_type"("id") ON DELETE cascade ON UPDATE no action;