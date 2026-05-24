## core.ts

**Purpose:** The single canonical commit primitive every map mutation flows through — one `INSERT INTO ap_map_event` per change, which the `tg_map_event_notify` trigger fans out on `map:<map_id>`.
**File:** `src/lib/map/mutations/core.ts`

---

### commitMapEvent<K extends MapEventKind>(args: CommitMapEventArgs<K>): Promise<ActionResult<MapEventPayload>>
Opens a `db.transaction` (or joins `args.tx` if passed), pre-allocates the next `ap_map_event.id` from the table sequence (via `pg_get_serial_sequence`), runs `args.mutate(tx, eventId)` for the row write(s), builds `{ kind, eventId, ...patch }`, validates it against `mapEventPayloadSchema`, and inserts exactly one `ap_map_event` row with that explicit id. The pre-allocated `eventId` is embedded in the payload *before* the insert so the trigger's notify carries it (the client dedupe key).

Side effects: one event-row insert (the trigger fires `pg_notify`); nothing else — no app-level `pg_notify`, no dual-write. A throwing `mutate` or a payload that fails validation rolls back the active transaction; in standalone mode it surfaces as `{ ok: false }`, in joined-tx mode the error re-throws so the caller's outer transaction aborts.

**Parameters:**
- `args.mapId` — `ap_map_event.map_id` (bigint).
- `args.characterId` — audit FK (`character_id`), `null` when the actor was erased.
- `args.kind` — one of the 12 `MapEventKind` discriminators.
- `args.mutate(tx, eventId)` — performs the row write(s) inside the transaction and returns the patch body (`MapEventPatch<K>` — everything except `kind`/`eventId`).
- `args.tx` *(optional)* — a caller-owned `Tx` from an outer `db.transaction`. When present, the helper skips its own transaction wrapper and runs on this tx; failures throw so the outer batch rolls back. Used by `bulkSignatures.ts` (Stage 10.2) to commit N events atomically.

**Returns:** `{ ok: true, data, eventId }` with the validated `MapEventPayload`, or `{ ok: false, error }` (standalone mode only — in joined-tx mode failures throw).

---

### type Tx
The Drizzle transaction handle used by `commitMapEvent` and its callers. Exported so bulk orchestrators can declare `tx: Tx` parameters of their own. Defined as `Parameters<Parameters<typeof db.transaction>[0]>[0]`.

### type ActionResult<T>
`{ ok: true; data: T; eventId: number } | { ok: false; error: string }` — the shared discriminated result for every mutation pathway (Server Actions and JSON API routes). Re-exported from `src/types/index.ts`.

### type CommitMapEventArgs<K>
The argument bag for `commitMapEvent` (see parameters above).

### Notes
- **No `import 'server-only'`.** This module is the low-level commit primitive consumed by the high-level mutation wrappers (`signatures.ts` / `connections.ts` / `systems.ts` — all of which carry the guard) AND by the Stage 11 graphile-worker tasks under `src/lib/jobs/tasks/`, which run under plain Node (no React `react-server` export condition) and would crash on the bare `server-only/index.js` throw. The client-bundle guard lives at the wrapper layer instead, which is the API surface a Client Component might mistakenly reach for.
