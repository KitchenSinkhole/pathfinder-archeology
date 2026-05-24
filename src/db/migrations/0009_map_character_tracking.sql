CREATE TABLE "ap_map_character_tracking" (
	"map_id" bigint NOT NULL,
	"character_id" bigint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_map_character_tracking_map_id_character_id_pk" PRIMARY KEY("map_id","character_id")
);
--> statement-breakpoint
ALTER TABLE "ap_map_character_tracking" ADD CONSTRAINT "ap_map_character_tracking_map_id_ap_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."ap_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_character_tracking" ADD CONSTRAINT "ap_map_character_tracking_character_id_ap_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."ap_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_map_character_tracking_character_idx" ON "ap_map_character_tracking" USING btree ("character_id");