-- Corporation name cache + structure-owner FK. `universe_corporation` is an
-- ESI-fed cache (id → name) populated by the structure-owner search, so repeat
-- lookups of the same corp serve from the DB instead of re-hitting ESI. The
-- structure owner now references it, mapping the owner to a real EVE corp.
CREATE TABLE "universe_corporation" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"last_fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ap_structure" ADD CONSTRAINT "ap_structure_owner_corporation_id_universe_corporation_id_fk" FOREIGN KEY ("owner_corporation_id") REFERENCES "public"."universe_corporation"("id") ON DELETE restrict ON UPDATE no action;
