-- Stage 15 — Permissions & access control schema.
--
-- Adds:
--   * Two new enums (`map_right`, `role_source`).
--   * `ap_corporation` — minimal corp registry (FK target for rights + roles).
--   * `ap_role`, `ap_character_role`, `ap_map_role_access` — tag-role overlay.
--   * `ap_corporation_right` — per-corp rights matrix (six rights × authz threshold).
--   * Owner FK columns on `ap_map`: `owner_character_id` / `owner_corporation_id` / `owner_alliance_id`.
--   * Kick-expiry + authz-sync timestamp columns on `ap_character`.
--
-- Rollback: src/db/migrations/0013_stage15_permissions.rollback.sql.

CREATE TYPE "public"."map_right" AS ENUM(
    'map_create',
    'map_update',
    'map_delete',
    'map_import',
    'map_export',
    'map_share'
);--> statement-breakpoint
CREATE TYPE "public"."role_source" AS ENUM('builtin', 'corp_title', 'external');--> statement-breakpoint

CREATE TABLE "ap_corporation" (
    "id" bigint PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "alliance_id" bigint,
    "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "ap_role" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "source" "role_source" NOT NULL,
    "external_ref" text,
    "name" text NOT NULL,
    "display_label" text,
    "corporation_id" bigint,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ap_role_source_external_ref_uq" UNIQUE("source","external_ref")
);--> statement-breakpoint
ALTER TABLE "ap_role" ADD CONSTRAINT "ap_role_corporation_id_ap_corporation_id_fk" FOREIGN KEY ("corporation_id") REFERENCES "public"."ap_corporation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_role_corporation_id_idx" ON "ap_role" USING btree ("corporation_id");--> statement-breakpoint

CREATE TABLE "ap_character_role" (
    "character_id" bigint NOT NULL,
    "role_id" bigint NOT NULL,
    "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "granted_by" text,
    CONSTRAINT "ap_character_role_pk" PRIMARY KEY("character_id","role_id")
);--> statement-breakpoint
ALTER TABLE "ap_character_role" ADD CONSTRAINT "ap_character_role_character_id_ap_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."ap_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_character_role" ADD CONSTRAINT "ap_character_role_role_id_ap_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."ap_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_character_role_role_id_idx" ON "ap_character_role" USING btree ("role_id");--> statement-breakpoint

CREATE TABLE "ap_map_role_access" (
    "map_id" bigint NOT NULL,
    "role_id" bigint NOT NULL,
    "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ap_map_role_access_pk" PRIMARY KEY("map_id","role_id")
);--> statement-breakpoint
ALTER TABLE "ap_map_role_access" ADD CONSTRAINT "ap_map_role_access_map_id_ap_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."ap_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_role_access" ADD CONSTRAINT "ap_map_role_access_role_id_ap_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."ap_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_map_role_access_role_id_idx" ON "ap_map_role_access" USING btree ("role_id");--> statement-breakpoint

CREATE TABLE "ap_corporation_right" (
    "corporation_id" bigint NOT NULL,
    "right" "map_right" NOT NULL,
    "min_authz_level" "authz_level" NOT NULL,
    CONSTRAINT "ap_corporation_right_pk" PRIMARY KEY("corporation_id","right")
);--> statement-breakpoint
ALTER TABLE "ap_corporation_right" ADD CONSTRAINT "ap_corporation_right_corporation_id_ap_corporation_id_fk" FOREIGN KEY ("corporation_id") REFERENCES "public"."ap_corporation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ap_map" ADD COLUMN "owner_character_id" bigint;--> statement-breakpoint
ALTER TABLE "ap_map" ADD COLUMN "owner_corporation_id" bigint;--> statement-breakpoint
ALTER TABLE "ap_map" ADD COLUMN "owner_alliance_id" bigint;--> statement-breakpoint
ALTER TABLE "ap_map" ADD CONSTRAINT "ap_map_owner_character_id_ap_character_id_fk" FOREIGN KEY ("owner_character_id") REFERENCES "public"."ap_character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Owner column matches `type`. Allows all-NULL during transition for any
-- rows created before Stage 15 wiring; `src/lib/auth/rights.ts` treats those
-- rows as admin-only (defensive default).
ALTER TABLE "ap_map" ADD CONSTRAINT "ap_map_owner_matches_type_chk" CHECK (
    (owner_character_id IS NULL AND owner_corporation_id IS NULL AND owner_alliance_id IS NULL)
    OR (type = 'private'  AND owner_character_id   IS NOT NULL AND owner_corporation_id IS NULL     AND owner_alliance_id IS NULL)
    OR (type = 'corp'     AND owner_character_id   IS NULL     AND owner_corporation_id IS NOT NULL AND owner_alliance_id IS NULL)
    OR (type = 'alliance' AND owner_character_id   IS NULL     AND owner_corporation_id IS NULL     AND owner_alliance_id IS NOT NULL)
);--> statement-breakpoint

ALTER TABLE "ap_character" ADD COLUMN "status_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ap_character" ADD COLUMN "authz_synced_at" timestamp with time zone;
