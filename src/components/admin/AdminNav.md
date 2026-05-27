## AdminNav

**Purpose:** Left-side vertical nav for the `(admin)` route group.
**File:** `src/components/admin/AdminNav.tsx`

### Props

None — the active section is derived from `usePathname()`.

### Renders
A `<nav>` containing one `<Link>` per admin section: Dashboard (`/admin`), Maps (`/admin/maps`), Members (`/admin/members`), Settings (`/admin/settings`). The active item gets `aria-current="page"` and a muted background.

### Behaviour & Interactions
- Active-match rule: `/admin` matches only exactly; every other section also matches descendant paths (`/admin/maps/123` is "Maps").
- Pure presentational client component — no data, no mutations.

### Depends On
- `usePathname` from `next/navigation`.
- `cn` from `@/lib/utils`.

### Notes
- Maps / Members / Settings target pages are added in sub-stages 16.2 / 16.3 / 16.5. Clicking them before those stages land yields a Next.js 404; that's expected per the sub-stage 16.1 scope.
