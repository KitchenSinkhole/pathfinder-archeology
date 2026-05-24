## expiredConnections.ts

**Purpose:** Cron task that hard-deletes wormhole connections older than the practical lifetime cap (`scope = 'wh' AND created_at < now() - WH_CONNECTION_EXPIRY_SECONDS`) on maps that opt in via `ap_map.delete_expired_connections`. Stage 11.2.
**File:** `src/lib/jobs/tasks/expiredConnections.ts`

---

### expiredConnections: JobModule
- `name`: `'expired-connections'`
- `cron`: `'0 * * * *'` (hourly; matches legacy `@hourly`).
- `run`: `withInstrumentation('expired-connections', expire)`.

### expire(): { scanned, deleted, failed }
Selects up to `JOB_DELETE_BATCH_SIZE` rows from `ap_map_connection` joined with `ap_map`, filtered by `scope = 'wh'`, `created_at < now() - 172800s` (`WH_CONNECTION_EXPIRY_SECONDS` = 48h), `ap_map.delete_expired_connections = true`, `ap_map.deleted_at IS NULL`. For each, fires `commitMapEvent({ kind: 'connection.delete', characterId: null })`. Non-WH scopes (`stargate`, `jumpbridge`, `abyssal`) are stable and never expire on age alone.

Counts land in `ap_job_run.notes`.

### Notes
- 48h is the absolute maximum a wormhole can stay open in EVE; the cron is the safety net for wormholes that collapsed off-screen and never got marked.
- Distinct from `eolExpiry`: that one is about the EOL *flag* timer (4h 15m after EOL flips true); this one is about absolute age regardless of flag state.
