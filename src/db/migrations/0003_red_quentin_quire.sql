CREATE TYPE "public"."authz_level" AS ENUM('member', 'manager', 'admin');--> statement-breakpoint
CREATE TYPE "public"."character_status" AS ENUM('active', 'kicked', 'banned');--> statement-breakpoint
CREATE TABLE "ap_user" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ap_user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ap_character" (
	"id" bigint PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"owner_hash" text NOT NULL,
	"corporation_id" bigint,
	"alliance_id" bigint,
	"esi_access_token" text,
	"esi_refresh_token" text,
	"esi_access_token_expires" timestamp with time zone,
	"esi_scopes" text[],
	"status" character_status DEFAULT 'active' NOT NULL,
	"status_changed_at" timestamp with time zone,
	"status_reason" text,
	"authz_level" "authz_level" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ap_character" ADD CONSTRAINT "ap_character_user_id_ap_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ap_user"("id") ON DELETE cascade ON UPDATE no action;