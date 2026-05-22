CREATE TYPE "public"."connection_scope" AS ENUM('wh', 'stargate', 'jumpbridge', 'abyssal');--> statement-breakpoint
CREATE TYPE "public"."map_scope" AS ENUM('wh', 'k_space', 'none', 'all');--> statement-breakpoint
CREATE TYPE "public"."map_type" AS ENUM('private', 'corp', 'alliance');--> statement-breakpoint
CREATE TYPE "public"."system_status" AS ENUM('unknown', 'friendly', 'occupied', 'hostile', 'empty', 'unscanned');--> statement-breakpoint
CREATE TYPE "public"."wh_jump_mass" AS ENUM('s', 'm', 'l', 'xl');--> statement-breakpoint
CREATE TYPE "public"."wh_mass" AS ENUM('fresh', 'reduced', 'critical');--> statement-breakpoint
CREATE TABLE "ap_map" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scope" "map_scope" NOT NULL,
	"type" "map_type" NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"delete_expired_connections" boolean DEFAULT true NOT NULL,
	"delete_eol_connections" boolean DEFAULT true NOT NULL,
	"track_abyssal_jumps" boolean DEFAULT true NOT NULL,
	"log_activity" boolean DEFAULT true NOT NULL,
	"next_bookmarks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ap_map_system" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"map_id" bigint NOT NULL,
	"system_id" integer NOT NULL,
	"visible" boolean NOT NULL,
	"position_x" double precision DEFAULT 0 NOT NULL,
	"position_y" double precision DEFAULT 0 NOT NULL,
	"alias" text,
	"tag" text,
	"status" "system_status" DEFAULT 'unknown' NOT NULL,
	"intel_notes" text,
	"locked" boolean DEFAULT false NOT NULL,
	"rally_at" timestamp with time zone,
	"first_added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_visible_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ap_map_connection" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"map_id" bigint NOT NULL,
	"source_map_system_id" bigint NOT NULL,
	"target_map_system_id" bigint NOT NULL,
	"scope" "connection_scope" NOT NULL,
	"mass_status" "wh_mass" DEFAULT 'fresh' NOT NULL,
	"jump_mass_class" "wh_jump_mass",
	"is_eol" boolean DEFAULT false NOT NULL,
	"is_frigate" boolean DEFAULT false NOT NULL,
	"preserve_mass" boolean DEFAULT false NOT NULL,
	"is_rolling" boolean DEFAULT false NOT NULL,
	"eol_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_map_connection_no_self_loop" CHECK ("ap_map_connection"."source_map_system_id" <> "ap_map_connection"."target_map_system_id")
);
--> statement-breakpoint
CREATE TABLE "ap_map_signature" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"map_system_id" bigint NOT NULL,
	"map_connection_id" bigint,
	"sig_id" text NOT NULL,
	"group_id" integer,
	"type_id" integer,
	"name" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ap_map_event" (
	"id" bigserial,
	"map_id" bigint NOT NULL,
	"character_id" bigint,
	"occurred_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	CONSTRAINT "ap_map_event_id_occurred_at_pk" PRIMARY KEY("id","occurred_at")
) PARTITION BY RANGE ("occurred_at");
--> statement-breakpoint
-- Monthly partitions managed by pg_partman (installed into the `partman` schema
-- by docker/postgres/initdb/01-extensions.sql). create_parent provisions the
-- current + premake-ahead month partitions and a default catch-all.
SELECT partman.create_parent(
	p_parent_table := 'public.ap_map_event',
	p_control := 'occurred_at',
	p_interval := '1 month'
);
--> statement-breakpoint
CREATE TABLE "ap_event_kind" (
	"kind" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ap_map_system" ADD CONSTRAINT "ap_map_system_map_id_ap_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."ap_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_system" ADD CONSTRAINT "ap_map_system_system_id_universe_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_system"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_connection" ADD CONSTRAINT "ap_map_connection_map_id_ap_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."ap_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_connection" ADD CONSTRAINT "ap_map_connection_source_map_system_id_ap_map_system_id_fk" FOREIGN KEY ("source_map_system_id") REFERENCES "public"."ap_map_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_connection" ADD CONSTRAINT "ap_map_connection_target_map_system_id_ap_map_system_id_fk" FOREIGN KEY ("target_map_system_id") REFERENCES "public"."ap_map_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_signature" ADD CONSTRAINT "ap_map_signature_map_system_id_ap_map_system_id_fk" FOREIGN KEY ("map_system_id") REFERENCES "public"."ap_map_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_signature" ADD CONSTRAINT "ap_map_signature_map_connection_id_ap_map_connection_id_fk" FOREIGN KEY ("map_connection_id") REFERENCES "public"."ap_map_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_signature" ADD CONSTRAINT "ap_map_signature_group_id_universe_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."universe_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_signature" ADD CONSTRAINT "ap_map_signature_type_id_universe_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."universe_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_event" ADD CONSTRAINT "ap_map_event_map_id_ap_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."ap_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_event" ADD CONSTRAINT "ap_map_event_character_id_ap_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."ap_character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ap_map_system_map_system_uq" ON "ap_map_system" USING btree ("map_id","system_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ap_map_signature_system_sig_uq" ON "ap_map_signature" USING btree ("map_system_id","sig_id");--> statement-breakpoint
CREATE INDEX "ap_map_event_map_occurred_idx" ON "ap_map_event" USING btree ("map_id","occurred_at" DESC);--> statement-breakpoint
CREATE INDEX "ap_map_event_character_occurred_idx" ON "ap_map_event" USING btree ("character_id","occurred_at" DESC);--> statement-breakpoint
-- Realtime fan-out hook: every map mutation lands as one INSERT here, and this
-- trigger publishes the payload on channel `map:<map_id>` for the WS server's
-- LISTEN handler. The WebSocket stays broadcast-only; this is the sole emitter.
CREATE FUNCTION "fn_map_event_notify"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	PERFORM pg_notify('map:' || NEW.map_id::text, COALESCE(NEW.payload::text, '{}'));
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "tg_map_event_notify"
	AFTER INSERT ON "ap_map_event"
	FOR EACH ROW EXECUTE FUNCTION "fn_map_event_notify"();--> statement-breakpoint
INSERT INTO "ap_event_kind" ("kind", "category") VALUES
	('system.added', 'system'),
	('system.removed', 'system'),
	('system.updated', 'system'),
	('connection.create', 'connection'),
	('connection.update', 'connection'),
	('connection.delete', 'connection'),
	('signature.create', 'signature'),
	('signature.update', 'signature'),
	('signature.delete', 'signature'),
	('map.create', 'map'),
	('map.update', 'map'),
	('map.delete', 'map');