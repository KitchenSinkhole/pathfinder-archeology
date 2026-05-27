CREATE TABLE IF NOT EXISTS "universe_sovereignty_map" (
	"system_id" integer PRIMARY KEY NOT NULL,
	"faction_id" bigint,
	"alliance_id" bigint,
	"corporation_id" bigint,
	CONSTRAINT "universe_sovereignty_map_system_id_universe_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_system"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "universe_faction_war_system" (
	"system_id" integer NOT NULL,
	"owner_faction_id" bigint,
	"occupier_faction_id" bigint,
	"contested" text,
	"victory_points" integer,
	"victory_points_threshold" integer,
	CONSTRAINT "universe_faction_war_system_system_id_pk" PRIMARY KEY("system_id"),
	CONSTRAINT "universe_faction_war_system_system_id_universe_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_system"("id") ON DELETE cascade ON UPDATE no action
);
