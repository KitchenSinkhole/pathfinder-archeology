## registry.ts

**Purpose:** Central registry of graphile-worker task modules. Builds the `TaskList` and `CronItem[]` consumed by `runner.ts`.
**File:** `src/lib/jobs/registry.ts`

---

### interface JobModule
What each task file under `src/lib/jobs/tasks/` exports.

- `name` - graphile-worker task identifier; globally unique.
- `cron` - optional 5-field cron expression. Omit for tasks scheduled by `addJob` rather than cron.
- `run` - the graphile-worker `Task` handler. Should be wrapped in `withInstrumentation(name, raw)` so every invocation lands in `ap_job_run`.

### jobModules(): readonly JobModule[]
The full registered set. Exposed primarily for operability pages and CLI scripts.

### onDemandJobModules(): readonly JobModule[]
The subset the `/setup` ops console may enqueue with an empty payload — `modules.filter((m) => m.cron !== undefined)`. Cron-driven tasks take no required payload, so a payload-less enqueue is always valid. Payload-driven `addJob`-only tasks (`location-poll`, `webhook-dispatch`) are excluded because enqueuing them empty crashes the handler; `sde-ingest` and `csv-ingest` are payload-less but have their own dedicated console cards.

### buildTaskList(extra?): TaskList
Builds the graphile-worker `TaskList` map (`{ [name]: run }`) from the registry. Throws on duplicate task names.

### buildCronItems(extra?): CronItem[]
Builds graphile-worker cron items for modules whose `cron` is set. The identifier is the task name for stable de-duplication.

### Notes
- No `taskDirectory` - explicit imports keep wiring greppable and TypeScript-checked.
- Per-task cron expressions live on each task module.
- Stage 13 registers `sov-fw-refresh`, the hourly sovereignty / faction-warfare ESI refresh task.
- Stage 14 registers `webhook-dispatch`, a non-cron task enqueued by `commitMapEvent` per `ap_map_event` insert on maps with at least one configured Discord webhook.
- Stage 15.6 registers `character-cleanup`, the 5-minute cron that clears expired kicks and resyncs stale `authz_level` rows against ESI (replaces legacy `cleanUpCharacterData`).
- Stage 16.6 registers `sde-ingest`, a non-cron task wrapping `runIngest` so the setup wizard can trigger a static-data refresh on-demand.
- Registers `csv-ingest`, a non-cron task wrapping `runCsvIngest` so the setup wizard can re-ingest the vendored wormhole CSVs (statics/overrides/classes) without re-running the full SDE ingest.
- Stage 11.6 registered a `structure-resolve` ESI stub; **Stage 17.1 retired it** — ESI cannot return other corps' structures, so structure intel is manual entry (`ap_structure`) with no recurring resolve job.
