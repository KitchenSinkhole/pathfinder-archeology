CREATE TABLE "ap_job_run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"success" boolean,
	"error_text" text,
	"notes" jsonb
);
--> statement-breakpoint
CREATE INDEX "ap_job_run_name_started_at_idx" ON "ap_job_run" USING btree ("name","started_at" DESC NULLS LAST);