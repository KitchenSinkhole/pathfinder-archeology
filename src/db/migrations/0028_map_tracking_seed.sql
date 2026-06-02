CREATE TABLE "ap_map_tracking_seed" (
	"map_id" bigint NOT NULL,
	"user_id" integer NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_map_tracking_seed_map_id_user_id_pk" PRIMARY KEY("map_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ap_map_tracking_seed" ADD CONSTRAINT "ap_map_tracking_seed_map_id_ap_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."ap_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_tracking_seed" ADD CONSTRAINT "ap_map_tracking_seed_user_id_ap_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ap_user"("id") ON DELETE cascade ON UPDATE no action;
