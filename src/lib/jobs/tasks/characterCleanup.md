## characterCleanup.ts

**Purpose:** Stage 15.6 cron-driven character maintenance. Handles two responsibilities the legacy `cleanUpCharacterData` job ran: timed-kick expiry and periodic authz resync against ESI. Lands the legacy task deferred from Stage 11.
**File:** `src/lib/jobs/tasks/characterCleanup.ts`

---

### characterCleanup: JobModule
- `name`: `'character-cleanup'`
- `cron`: `apertureConfig.CHARACTER_CLEANUP_CRON` (default `*/5 * * * *` — 5-minute cadence keeps post-expiry login latency below the legacy minimum 5-minute kick duration).
- `run`: `withInstrumentation('character-cleanup', cleanup)` — `ap_job_run` carries per-tick metrics.

### Phases

**1. Kick expiry.** A single bulk UPDATE flips `status='kicked' → 'active'` for every row where `status_expires_at <= now()`, clearing `status_expires_at` and `status_reason`. Banned rows (`status='banned'`, `status_expires_at IS NULL`) are never touched. No `pg_notify` — the realtime bus doesn't subscribe to `ap_character`; sessions pick up the new status at next refresh.

**2. Periodic authz resync.** Pulls up to `CHARACTER_AUTHZ_RESYNC_BATCH_SIZE` (25) characters where `status='active'`, `esi_refresh_token IS NOT NULL`, and `authz_synced_at IS NULL OR <= now() - CHARACTER_AUTHZ_RESYNC_STALE_AFTER_MS` (6h). Calls `syncCharacterAuthz(id)` for each. ESI failures are absorbed row-by-row (the helper returns `{ applied: false, skipped }` without touching the DB) so a noisy CCP outage doesn't poison the batch. Rows ordered by `authz_synced_at ASC NULLS FIRST` so the stalest data drains first.

### Notes payload (in `ap_job_run.notes`)
```ts
{
  kicksCleared: number,
  authzResynced: number,
  authzSkipped: number,
  authzScanned: number,
}
```

### Depends On
- `@/db/client` (`db`), `@/db/schema` (`apCharacter`).
- `@/lib/auth/syncCharacterAuthz` — the per-character reconciliation helper.
- `aperture.config` — `CHARACTER_CLEANUP_CRON`, `CHARACTER_AUTHZ_RESYNC_STALE_AFTER_MS`, `CHARACTER_AUTHZ_RESYNC_BATCH_SIZE`.

### Invariants
- Bans are permanent. The job never touches `status='banned'` rows.
- Each character is touched at most once per tick (LIMIT batch).
- A single bad character cannot abort the tick — `try/catch` per row.
