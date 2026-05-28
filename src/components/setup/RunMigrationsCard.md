## RunMigrationsCard

**Purpose:** Client wrapper around `SetupCard` that owns the result-formatting closure for `setupRunMigrations`.
**File:** `src/components/setup/RunMigrationsCard.tsx`

### Renders
A `SetupCard` configured to call `setupRunMigrations` and render the result as `"No pending migrations."` or `"Applied N: tag1, tag2"`.

### Notes
- Server Components can't pass plain function props to client components, so the per-trigger `renderResult` closure lives in this client wrapper rather than the `/setup` page.
