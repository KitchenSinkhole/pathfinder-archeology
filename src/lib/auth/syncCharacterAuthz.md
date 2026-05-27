## syncCharacterAuthz.ts

**Purpose:** Reconcile one character's derived authority state (`authz_level`, affiliations, corp-title role memberships) against ESI in a single transactional pass. Called from the Auth.js JWT callback on initial sign-in and the Stage 15.6 `character-cleanup` job's periodic resync.
**File:** `src/lib/auth/syncCharacterAuthz.ts`

---

### syncCharacterAuthz(characterId: bigint): Promise<SyncCharacterAuthzResult>

Pulls three ESI endpoints in parallel — `getCharacter`, `getCharacterRoles`, `getCharacterTitles` — then runs a single transaction that:

1. **Upserts `ap_corporation`** for the character's corp id (FK target for role rows + rights matrix). Refreshes `alliance_id` and `last_synced_at`; leaves `name` alone (filled by the dedicated corp-name resolver).
2. **Updates `ap_character`** — sets `corporation_id`, `alliance_id`, `authz_synced_at`. `authz_level` is set to `'admin'` iff ESI returns `apertureConfig.AUTHZ_ADMIN_ROLE` (`'Director'`), else `'member'`. Existing `'manager'` rows are preserved by an inline `CASE` so explicit admin-panel grants survive resyncs.
3. **Reconciles `ap_character_role` rows with `source='corp_title'`** — upserts an `ap_role` per ESI title (`external_ref='<corp_id>:<title_id>'`), inserts memberships for newly held titles, deletes memberships for titles no longer returned by ESI. Built-in / external (Discord) role grants are untouched.

**ESI failures (`EsiBreakerOpenError`, `EsiDowntimeError`, `EsiTokenError`, `EsiHttpError`)** cause the function to return `{ applied: false, skipped: <reason> }` *before* touching the DB. Unexpected errors propagate to the caller.

**Returns** `SyncCharacterAuthzResult`:
- `authzLevel` — `'admin' | 'manager' | 'admin'` the sync resolved to (does not reflect a preserved `'manager'` — that path returns the derived value for telemetry).
- `isDirector` — whether the Director role was present.
- `corporationId`, `allianceId` — the affiliations written.
- `titleCount` — number of `corp_title` roles reconciled.
- `applied` — `true` if the DB was updated; `false` with a `skipped` reason if ESI was unreachable.

### Depends On
- ESI: `getCharacter`, `getCharacterRoles`, `getCharacterTitles` via `esiCall`.
- Schema: `ap_character`, `ap_corporation`, `ap_role`, `ap_character_role`.
- Constants: `apertureConfig.AUTHZ_ADMIN_ROLE` (`'Director'`).

### Invariants
- A character with neither corp roles nor titles ends up with `authz_level='member'` and no `corp_title` role rows.
- A character whose Director role is removed in-game demotes to `member` on the next sync — admin status is **not sticky** (legacy semantics, SPEC `09-permissions-and-admin.md` lines 54–55).
- ESI failure never leaves a partial sync — the transaction either runs to completion or no DB write happens.
