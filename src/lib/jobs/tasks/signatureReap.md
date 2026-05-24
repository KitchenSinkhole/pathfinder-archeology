## signatureReap.ts

**Purpose:** Cron task that deletes expired in-game scan signatures (`ap_map_signature.expires_at < now()`), excluding soft-deleted maps. Stage 11.2.
**File:** `src/lib/jobs/tasks/signatureReap.ts`

---

### signatureReap: JobModule
- `name`: `'signature-reap'`
- `cron`: `'*/30 * * * *'` (every 30 minutes; matches legacy `@halfHour`).
- `run`: `withInstrumentation('signature-reap', reap)`.

### reap(): { scanned, deleted, failed }
Selects up to `JOB_DELETE_BATCH_SIZE` expired signature rows on non-soft-deleted maps via `ap_map_signature → ap_map_system → ap_map`. For each row, calls `commitMapEvent` with `kind: 'signature.delete'`, `characterId: null` (system-initiated) — the trigger fires `pg_notify`, the bus forwards it as `mapUpdate`, client tabs apply the disappearance the same way they'd handle a user delete.

Per-row transactions: one bad row never blocks the rest. The counts land in `ap_job_run.notes`.

### Notes
- Generalised from the legacy `deleteSignatures` job, which only reaped sigs on **inactive** systems (no longer a thing in the rebuild — `ap_map_system.visible` is the lifecycle flag, and signature expiry is purely about `expires_at`). SPEC §6.5.
- Signatures bound to a connection cascade-delete when that connection collapses, so the reaper only sees sigs whose `expires_at` arrives before any owning wormhole dies.
