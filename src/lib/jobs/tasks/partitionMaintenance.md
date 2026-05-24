## partitionMaintenance.ts

**Purpose:** Daily cron that runs `partman.run_maintenance(p_analyze := false)` to (a) pre-create upcoming `ap_map_event` (monthly) and `ap_system_stats` (daily) partitions, and (b) detach+drop `ap_system_stats` partitions older than the 60-day retention window set by migration 0008. Stage 11.5.
**File:** `src/lib/jobs/tasks/partitionMaintenance.ts`

---

### partitionMaintenance: JobModule
- `name`: `'partition-maintenance'`
- `cron`: `'5 4 * * *'` (04:05 UTC daily — well clear of the 11:00 EVE downtime window and of the :00/:15/:30 cron slots used by the other Stage-11 jobs).
- `run`: `withInstrumentation('partition-maintenance', maintain)`.

### maintain(): { durationMs }
Single `SELECT partman.run_maintenance(p_analyze := false)`. Passing no parent argument runs maintenance over every row in `partman.part_config`, so any future partitioned table (sov, intel, etc.) registers its own retention via its own migration and is picked up by this job automatically. `ap_job_run.notes.durationMs` captures the runtime.

### Notes
- **`p_analyze := false`** — partman would otherwise run `ANALYZE` on each newly-created partition. We skip it because the partitions are immediately written into (Postgres autovacuum will analyze them in due course) and the synchronous ANALYZE on a fresh empty partition is pure overhead.
- The two partitioned tables today (`ap_map_event`, `ap_system_stats`) have very different retention policies: events keep all months by default (SPEC §6.5 — deployments may attach their own), stats drop after 60 days (migration 0008). Both policies are stored in `partman.part_config` and applied here.
- If this job fails to run, the failure mode is silent at first (existing partitions still accept writes) but cascades: once the writer hits a timestamp past the last pre-created partition, inserts start erroring. The operability sweep in 11.6 surfaces consecutive failures.
