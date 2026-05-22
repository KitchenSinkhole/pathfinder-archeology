CREATE TABLE "universe_constellation" (
	"id" integer PRIMARY KEY NOT NULL,
	"region_id" integer NOT NULL,
	"name" text NOT NULL,
	"x" double precision,
	"y" double precision,
	"z" double precision
);
--> statement-breakpoint
CREATE TABLE "universe_region" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "universe_stargate_edge" (
	"from_system_id" integer NOT NULL,
	"to_system_id" integer NOT NULL,
	CONSTRAINT "universe_stargate_edge_from_system_id_to_system_id_pk" PRIMARY KEY("from_system_id","to_system_id")
);
--> statement-breakpoint
CREATE TABLE "universe_system" (
	"id" integer PRIMARY KEY NOT NULL,
	"constellation_id" integer NOT NULL,
	"name" text NOT NULL,
	"security" text,
	"true_sec" double precision,
	"security_status" double precision,
	"security_class" text,
	"effect" text,
	"x" double precision,
	"y" double precision,
	"z" double precision
);
--> statement-breakpoint
CREATE TABLE "universe_category" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"published" boolean
);
--> statement-breakpoint
CREATE TABLE "universe_group" (
	"id" integer PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"published" boolean
);
--> statement-breakpoint
CREATE TABLE "universe_type" (
	"id" integer PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"mass" double precision,
	"volume" double precision,
	"capacity" double precision,
	"radius" double precision,
	"packaged_volume" double precision,
	"portion_size" integer,
	"market_group_id" integer,
	"graphic_id" integer,
	"published" boolean
);
--> statement-breakpoint
CREATE TABLE "universe_dogma_attribute" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text,
	"display_name" text,
	"description" text,
	"published" boolean,
	"stackable" boolean,
	"high_is_good" boolean,
	"default_value" double precision,
	"icon_id" integer,
	"unit_id" integer
);
--> statement-breakpoint
CREATE TABLE "universe_type_attribute" (
	"type_id" integer NOT NULL,
	"attribute_id" integer NOT NULL,
	"value" double precision,
	CONSTRAINT "universe_type_attribute_type_id_attribute_id_pk" PRIMARY KEY("type_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "universe_type_override" (
	"type_id" integer NOT NULL,
	"attr_id" integer NOT NULL,
	"value" double precision NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "universe_type_override_type_id_attr_id_pk" PRIMARY KEY("type_id","attr_id")
);
--> statement-breakpoint
CREATE TABLE "universe_system_static" (
	"system_id" integer NOT NULL,
	"type_id" integer NOT NULL,
	CONSTRAINT "universe_system_static_system_id_type_id_pk" PRIMARY KEY("system_id","type_id")
);
--> statement-breakpoint
ALTER TABLE "universe_constellation" ADD CONSTRAINT "universe_constellation_region_id_universe_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."universe_region"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_stargate_edge" ADD CONSTRAINT "universe_stargate_edge_from_system_id_universe_system_id_fk" FOREIGN KEY ("from_system_id") REFERENCES "public"."universe_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_stargate_edge" ADD CONSTRAINT "universe_stargate_edge_to_system_id_universe_system_id_fk" FOREIGN KEY ("to_system_id") REFERENCES "public"."universe_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_system" ADD CONSTRAINT "universe_system_constellation_id_universe_constellation_id_fk" FOREIGN KEY ("constellation_id") REFERENCES "public"."universe_constellation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_group" ADD CONSTRAINT "universe_group_category_id_universe_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."universe_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_type" ADD CONSTRAINT "universe_type_group_id_universe_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."universe_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_type_attribute" ADD CONSTRAINT "universe_type_attribute_type_id_universe_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."universe_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_type_attribute" ADD CONSTRAINT "universe_type_attribute_attribute_id_universe_dogma_attribute_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."universe_dogma_attribute"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_type_override" ADD CONSTRAINT "universe_type_override_type_id_universe_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."universe_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_system_static" ADD CONSTRAINT "universe_system_static_system_id_universe_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_system_static" ADD CONSTRAINT "universe_system_static_type_id_universe_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."universe_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "universe_stargate_edge_to_idx" ON "universe_stargate_edge" USING btree ("to_system_id");