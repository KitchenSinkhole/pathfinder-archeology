## settings.ts (admin server actions)

**Purpose:** Stage 16.5 admin actions on `ap_corporation_right`. Exposes upsert and delete for `(corporation_id, right)` rows from `/admin/settings`. Gated by `isManagerOrAdmin` plus a per-corp scope check — managers can only edit their own corp; admins can edit any.
**File:** `src/app/(admin)/actions/settings.ts`

---

### adminUpsertCorpRight({ corporationId, right, minAuthzLevel }): Promise<ActionResult>
Inserts or updates one `(corp, right)` row. Primary key is `(corporation_id, right)`; conflicting inserts overwrite `min_authz_level` only. Zod-validates the right against `mapRight.enumValues` and the level against `authzLevel.enumValues`. Revalidates `/admin/settings`.

### adminDeleteCorpRight({ corporationId, right }): Promise<ActionResult>
Deletes one row by `(corp, right)`. Idempotent — running against an already-absent row returns `{ ok: true }` (the matrix UI treats both as "none"). Revalidates `/admin/settings`.

---

### Gating helper (internal)
`gateForCorp(corporationId)` — resolves session, asserts `isManagerOrAdmin`, resolves `adminVisibilityScope`, then proves the target corp is in scope. A manager whose corp doesn't match the target gets the generic `"Corporation not found."` to avoid leaking the existence of out-of-scope rows.

---

### Depends on
- `auth` / `isManagerOrAdmin` / `adminVisibilityScope` — `@/lib/auth/rights` (16.1).
- `apCorporation`, `apCorporationRight`, `mapRight`, `authzLevel` — `@/db/schema`.

### Notes
- No `ap_map_event` row is written. Corp-right config is not map state; `ap_map_event` is map-scoped. Audit gap is documented in the Stage 16 plan ("What is intentionally NOT in scope").
- Manager scope check returns `"Corporation not found."` instead of `"Forbidden."` for parity with the maps/webhook actions' "don't leak existence" rule.
