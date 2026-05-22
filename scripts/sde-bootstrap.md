## sde-bootstrap.ts

**Purpose:** CLI entry point (`pnpm sde:bootstrap`) that runs the full SDE ingest and prints per-table counts.
**File:** `scripts/sde-bootstrap.ts`

Calls `runIngest()` from `src/lib/sde/ingest.ts`, closes the pool, exits `0` on success / non-zero on failure. Run against an empty migrated DB; re-running is idempotent (upserts).
