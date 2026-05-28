## /admin/settings — Corp rights matrix editor

**Purpose:** Stage 16.5 server component that renders the per-corp `ap_corporation_right` matrix. Admin sees a corp picker (`?corp=<id>`); manager is auto-scoped to their own corp.
**File:** `src/app/(admin)/admin/settings/page.tsx`

### Renders
- Page header with the actor's `adminVisibilityScope`.
- A one-paragraph explainer of the matrix semantics ("None" = no grant; the floor threshold meaning).
- `<CorpPicker>` for global-scope admins (hidden for managers).
- `<CorpRightsMatrix>` for the selected corp, or an empty-state card when no corp is picked / no corps exist.

### Behaviour
- `adminVisibilityScope` guards entry; non-manager/admin sessions get redirected to `/maps` by the existing `(admin)` layout, and this page additionally guards on a null scope.
- For a `corp` scope the URL `?corp=` parameter is ignored — the matrix is forced to the actor's own corp so a manager can't sneak into another corp by URL editing.
- For a `global` scope the URL `?corp=` parameter picks the corp; absent / unknown values fall back to the first corp alphabetically.

### Depends on
- `listCorpsForAdmin` / `loadCorpRightsMatrix` — `@/lib/admin/corpRights`.
- `adminVisibilityScope` — `@/lib/auth/rights`.
- `<CorpRightsMatrix>` / `<CorpPicker>` — `@/components/admin`.

### Notes
- The inline `pickCorp` helper centralises the "which corp do we render" decision so the manager-vs-admin behaviour is one rule, not two scattered branches.
