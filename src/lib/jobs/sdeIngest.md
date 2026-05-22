## sdeIngest (planned graphile-worker job)

**Status:** Not yet a background job. As of Stage 1, SDE ingest is a **one-shot CLI**, not a scheduled job.

- Ingest logic: `src/lib/sde/ingest.ts` (`runIngest`).
- CLI entry: `scripts/sde-bootstrap.ts` (`pnpm sde:bootstrap`).
- Security-label helper: `src/lib/sde/security.ts`.

The scheduled SDE-delta refresh job (using CCP's `changes/<build>.jsonl` automation feed) lands in a later stage; this file will document the `graphile-worker` task when it does.
