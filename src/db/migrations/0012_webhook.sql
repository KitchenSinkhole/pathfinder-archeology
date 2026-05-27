CREATE TYPE "public"."ap_webhook_channel" AS ENUM('discord');--> statement-breakpoint
CREATE TYPE "public"."ap_webhook_event" AS ENUM('history', 'rally');--> statement-breakpoint
CREATE TABLE "ap_map_webhook" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"map_id" bigint NOT NULL,
	"channel" "ap_webhook_channel" NOT NULL,
	"event" "ap_webhook_event" NOT NULL,
	"url" text NOT NULL,
	"username" text,
	"last_status" integer,
	"last_error" text,
	"last_attempted_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_map_webhook_map_channel_event_uq" UNIQUE("map_id","channel","event")
);
--> statement-breakpoint
ALTER TABLE "ap_map_webhook" ADD CONSTRAINT "ap_map_webhook_map_id_ap_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."ap_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_map_webhook_map_id_idx" ON "ap_map_webhook" USING btree ("map_id");
