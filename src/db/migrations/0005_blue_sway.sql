CREATE TABLE "ap_system_stats" (
	"system_id" integer NOT NULL,
	"hour_bucket" timestamp with time zone NOT NULL,
	"jumps" integer DEFAULT 0 NOT NULL,
	"ship_kills" integer DEFAULT 0 NOT NULL,
	"pod_kills" integer DEFAULT 0 NOT NULL,
	"faction_kills" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ap_system_stats_system_id_hour_bucket_pk" PRIMARY KEY("system_id","hour_bucket")
) PARTITION BY RANGE ("hour_bucket");
--> statement-breakpoint
-- Daily partitions managed by pg_partman (installed into the `partman` schema by
-- docker/postgres/initdb/01-extensions.sql), mirroring ap_map_event. Rolloff is
-- DETACH/DROP PARTITION, not DELETE.
SELECT partman.create_parent(
	p_parent_table := 'public.ap_system_stats',
	p_control := 'hour_bucket',
	p_interval := '1 day'
);
--> statement-breakpoint
ALTER TABLE "ap_system_stats" ADD CONSTRAINT "ap_system_stats_system_id_universe_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_system"("id") ON DELETE cascade ON UPDATE no action;
