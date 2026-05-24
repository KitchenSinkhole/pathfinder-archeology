## structureResolve.ts

**Purpose:** **STUB.** Reserves the `structure-resolve` graphile-worker task identifier and cron slot so the Stage 17 implementation can swap in the real handler body without touching the registry, the cron entry, or the `ap_job_run` history. Stage 11.6.
**File:** `src/lib/jobs/tasks/structureResolve.ts`

---

### structureResolve: JobModule
- `name`: `'structure-resolve'`
- `cron`: `'0 */6 * * *'` (every 6h — conservative; Stage 17 may tighten or loosen once the access pattern is real).
- `run`: `withInstrumentation('structure-resolve', resolve)`.

### resolve(): { deferred: 'stage-17' }
Returns the literal `{ deferred: 'stage-17' }` marker. The wrapper writes it into `ap_job_run.notes` so the Stage 11.6 operability sweep (`pnpm jobs:status`) does not flag the task as "never ran" during the one-week soak.

### Notes
- **This is not a real implementation.** The `ap_structure` table that the handler would resolve against does not exist yet — it lands with the structure intel module in Stage 17. The Stage 17 work is to replace the body of `resolve()` (and only that) with the real handler.
- The task is registered in `registry.ts` alongside the other Stage-11 tasks so it shares the runner, the instrumentation, and the operability tooling. Stage 17 ships zero scaffolding work as a result.
- Roadmap reference: Stage 17 in `docs/plans/rebuild-roadmap.md` explicitly names this stub by task name as the seam to fill.
