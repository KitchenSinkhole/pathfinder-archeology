## CorpRightsMatrix

**Purpose:** Stage 16.5 client component that renders the 6 rights × 4-column radio matrix (none / member / manager / admin) for a single corporation. Each radio click runs an optimistic-with-rollback Server Action against `ap_corporation_right`.
**File:** `src/components/admin/CorpRightsMatrix.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| corporationId | string | yes | Stringified `ap_corporation.id` of the corp being edited. |
| initial | CorpRightCell[] | yes | The six rows from `loadCorpRightsMatrix(corp).rights`. |

### Renders
Six-row, five-column table: one row per `map_right` enum value, one header column (right name + raw key) plus four radio columns (none, admin, manager, member). Column headers and checked radio buttons are color-coded by permissivity: red (none) → orange (admin) → yellow (manager) → green (member).

### Behaviour & Interactions
- Optimistic update on radio click — local state flips immediately, the Server Action runs in a `useTransition`, and on `{ ok: false }` the row reverts to its previous value and a toast surfaces the server error.
- The "none" column maps to `adminDeleteCorpRight`; the three authz columns map to `adminUpsertCorpRight`.
- Pending rows render at 60% opacity and disable their radios so a fast double-click can't race two updates against each other.
- No-op when the user re-selects the same column (no Server Action call).

### Emits / Calls
- `adminUpsertCorpRight` / `adminDeleteCorpRight` — `@/app/(admin)/actions/settings`.
- `toast.error` — `sonner`, surfaces server-side error messages.

### Depends on
- `CorpRightCell` / `CorpRightsMatrix` types — `@/lib/admin/corpRights`.
- `MapRight` / `AuthzLevel` enum unions — `@/types`.

### Local state
- `rows: CorpRightCell[]` — the live matrix; replaced cell-by-cell on optimistic apply / rollback.
- Per-row `pending` from `useTransition` — disables radios while the Server Action is in flight.
