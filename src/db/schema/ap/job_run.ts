import { bigserial, boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// SPEC §5.3. Per-invocation telemetry for the graphile-worker tasks introduced
// in Stage 11. Written by `withInstrumentation` (src/lib/jobs/withInstrumentation.ts)
// around every handler call: one row inserted at start, finalised at end with
// success/error/notes. The roadmap's "All cron jobs run on schedule for one
// full week with success metrics visible" gate is read off this table.
//
// graphile-worker's own tables live in the `graphile_worker` schema and are
// managed by its `runMigrations` API on first boot — those track queued/locked
// jobs, not historical outcomes. This table is the historical record we keep.
export const apJobRun = pgTable(
  'ap_job_run',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    name: text('name').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    success: boolean('success'),
    errorText: text('error_text'),
    notes: jsonb('notes'),
  },
  (t) => [index('ap_job_run_name_started_at_idx').on(t.name, t.startedAt.desc())],
);
