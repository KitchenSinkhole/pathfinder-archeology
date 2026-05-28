## members.ts

**Purpose:** Stage 16.3 admin-panel data loader for `/admin/members`. Returns the `ap_character` rows visible to the actor's `AdminVisibilityScope`, with the moderation + authz fields the action menu needs to decide which controls to show.
**File:** `src/lib/auth/members.ts`

---

### listAdminMembers(scope: AdminVisibilityScope): Promise<AdminMemberRow[]>
Selects `ap_character` rows filtered by `characterScopeFilterFor(scope)`:
- `global` (admin) → every character.
- `corp` (manager) → characters whose `corporation_id` matches the manager's corp.

Ordering: `(status ASC, name ASC)`. Because the enum is declared `['active', 'kicked', 'banned']` in DB order, an ASC sort puts active rows first, then kicked, then banned. *Within each band* rows alphabetise by name.

Bigints serialised to strings; timestamps to ISO so the row is safe to pass straight from the server component to a client island.

---

### AdminMemberRow (type)
`{ id, name, corporationId, allianceId, status, statusExpiresAt, statusReason, statusChangedAt, authzLevel, lastOnline, lastLocationAt }` — strings for the bigint ids, ISO timestamps, otherwise straight passthrough of the `ap_character` columns the admin UI renders.

---

### Depends on
- `apCharacter` — `@/db/schema`.
- `characterScopeFilterFor`, `AdminVisibilityScope` — `@/lib/auth/rights` (16.1).

### Notes
- `server-only` import guard — never bundled to the client.
- The dashboard counts in `src/app/(admin)/admin/page.tsx` (Stage 16.1) compute their own `COUNT(*)` queries against `apCharacter` rather than calling this loader; this function is the row-level fetch, not a count surface.
