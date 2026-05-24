## eolExpiry.ts

**Purpose:** Cron task that hard-deletes wormhole connections whose end-of-life timer has elapsed (`is_eol AND eol_at < now() - WORMHOLE_EOL_LIFETIME_MS`) on maps that opt in via `ap_map.delete_eol_connections`. Stage 11.2.
**File:** `src/lib/jobs/tasks/eolExpiry.ts`

---

### eolExpiry: JobModule
- `name`: `'eol-expiry'`
- `cron`: `'*/5 * * * *'` (every 5 minutes; matches legacy `@fiveMinutes`).
- `run`: `withInstrumentation('eol-expiry', expireEol)`.

### expireEol(): { scanned, deleted, failed }
Selects up to `JOB_DELETE_BATCH_SIZE` rows from `ap_map_connection` joined with `ap_map`, filtered by `is_eol = true`, `eol_at IS NOT NULL`, `eol_at < now() - 15300s` (`WORMHOLE_EOL_LIFETIME_MS / 1000` — same constant the canvas countdown reads, kept as ms per the project convention and converted to seconds at the SQL `make_interval` site), `ap_map.delete_eol_connections = true`, `ap_map.deleted_at IS NULL`. For each, fires `commitMapEvent({ kind: 'connection.delete', characterId: null })` — the trigger broadcasts the disappearance so client tabs drop the edge live. Attached `ap_map_signature` rows cascade-delete with the connection.

Counts land in `ap_job_run.notes`.

### Notes
- The `eol_at IS NOT NULL` guard skips the race where a writer sets `is_eol = true` but is mid-transaction on `eol_at`. The mutation core stamps both together (`connections.ts` `updateConnection`), so this is purely defensive.
- Replaces legacy `Cron\MapUpdate::deleteEolConnections`. The legacy job's per-row erase wrote a `connection_log` row — the rebuild's equivalent is the `ap_map_event` insert from `commitMapEvent`.
