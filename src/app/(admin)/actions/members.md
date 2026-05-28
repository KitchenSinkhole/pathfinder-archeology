## members.ts (admin server actions)

**Purpose:** Stage 16.3 admin actions on `ap_character` rows. Two action groups exposed at `/admin/members`: moderation (`kick` / `ban` / `activate`) and authz toggle (`grantManager` / `revokeManager`). All five gated by `isManagerOrAdmin` + `adminVisibilityScope`; the authz toggles additionally require `isAdmin`.
**File:** `src/app/(admin)/actions/members.ts`

---

### adminKickCharacter(characterId: string, minutes: 5 | 60 | 1440, reason?: string): Promise<ActionResult>
Sets `status='kicked'`, `status_expires_at = now() + minutes`, `status_reason = reason ?? null`, `status_changed_at = now()`. The `character-cleanup` cron (`src/lib/jobs/tasks/characterCleanup.ts`) handles the eventual flip back to `'active'`. Three durations only — 5, 60, 1440 minutes — per the Stage 16 plan.

### adminBanCharacter(characterId: string, reason: string): Promise<ActionResult>
Sets `status='banned'`, `status_expires_at = null`, `status_reason = reason`, `status_changed_at = now()`. `reason` is required (1-500 chars). Bans never auto-clear — `clearKickExpiries` in the cron filters on `status='kicked'`.

### adminActivateCharacter(characterId: string): Promise<ActionResult>
Clears any moderation state. Sets `status='active'` and NULLs `status_expires_at` / `status_reason`. Works on both kicked and banned rows.

### adminGrantManager(characterId: string): Promise<ActionResult>
**Admin only.** Promotes a `'member'` to `'manager'`. `syncCharacterAuthz` preserves the grant via its `CASE WHEN authz_level = 'manager'` clause, so the value survives every ESI resync. No-op when already `manager`; refuses to act on an `admin` row (admin is Director-derived).

### adminRevokeManager(characterId: string): Promise<ActionResult>
**Admin only.** Demotes a `'manager'` back to `'member'`. Refuses to act on `'admin'` rows.

---

### Gating + scoping

| Action | Required level | Scope |
|---|---|---|
| `adminKickCharacter` | manager | `characterScopeFilterFor(scope)` — manager only sees own corp |
| `adminBanCharacter` | manager | same |
| `adminActivateCharacter` | manager | same |
| `adminGrantManager` | admin | global |
| `adminRevokeManager` | admin | global |

Out-of-scope targets return `"Character not found."` — same shape as the "row missing" path, so existence isn't leaked to an out-of-corp manager.

### Audit

No DB-level audit row. `ap_map_event` is map-scoped, and the Stage 16 plan documents this gap (`docs/plans/stage-16-admin-panel-setup-wizard.md`, "What is intentionally NOT in scope").

### Depends on
- `auth`, `isAdmin`, `isManagerOrAdmin`, `adminVisibilityScope`, `characterScopeFilterFor` — `@/lib/auth/rights` (16.1).
- `apCharacter` — `@/db/schema`.
