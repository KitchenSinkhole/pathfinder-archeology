## SetupPage

**Purpose:** Operator console at `/setup`. Renders the unlock form when locked; renders trigger cards + a status panel when unlocked.
**File:** `src/app/(setup)/setup/page.tsx`

### Renders
- **Locked:** heading + `SetupUnlockForm`.
- **Unlocked:** heading + a `Lock` form (logout button), two top cards (`RunMigrationsCard`, `RunSdeIngestCard`), a per-task grid of `RunCronCard`s for every registered job module, and a `StatusPanel` showing recent `ap_job_run` rows + the latest applied migration `created_at` + the count of `ap_map_event` rows in the last hour. Each trigger is its own client wrapper around `SetupCard` so the page (a server component) doesn't pass any function props across the server/client boundary.

### Behaviour & Interactions
- Server component; reads `readSetupCookie()` to branch locked vs unlocked.
- `export const dynamic = 'force-dynamic'` — the page reads cookies + live DB state on every visit.
- Logout is a single-field `<form action={setupLogoutAction}>` so it works without JS.
- Each `SetupCard` is a client component that wraps the action in `useTransition` and toasts the outcome.

### Emits / Calls
- `setupLogoutAction` — Lock button (inline server-action wrapper so the `<form>` signature matches).
- Trigger client components own their own Server Action calls: [[RunMigrationsCard]], [[RunSdeIngestCard]], [[RunCronCard]].

### Notes
- The status panel queries `drizzle.__drizzle_migrations` and `ap_map_event` defensively (try/catch); on a fresh empty DB those tables may not exist yet.
- `dynamic = 'force-dynamic'` because Next would otherwise try to statically render the locked state at build time and miss the cookie-gated branching.
