## CorpPicker

**Purpose:** Stage 16.5 admin-only client component that lets a global-scope admin choose which corp's rights matrix is rendered on `/admin/settings`. Writes the chosen corp id to the `?corp=` query string and `router.push`es; the server component re-runs with the new selection.
**File:** `src/components/admin/CorpPicker.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| corps | { id: string; name: string }[] | yes | Corps the actor may pick from — produced by `listCorpsForAdmin`. |
| selectedId | string \| null | yes | Currently active corp id (matches `?corp=` after the page picks a default). |

### Renders
A single `Select` labelled "Corporation" with one item per corp.

### Behaviour & Interactions
- On change, mutates the query string with `URLSearchParams` and pushes the new URL. The server component re-renders with the new corp's matrix.
- Hidden for manager-scope sessions — the parent page only mounts it when `scope.kind === 'global'`.

### Depends on
- `Select` family from `@/components/ui/select`.
- `useRouter` / `useSearchParams` — `next/navigation`.
